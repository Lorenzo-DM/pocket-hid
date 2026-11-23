#include "macro.h"
#include <Preferences.h>
#include <vector>
#include "usb_hid.h"
#include "keymap.h"

static const char* NS = "mkmac";
static const char* IDX_KEY = "__idx";

static Preferences s_prefs;
static bool s_begun = false;
static void (*s_on_done)(const char*) = nullptr;

// ---------------------------------------------------------------------------
// Storage: ogni macro e' un blob JSON degli steps sotto la chiave = id.
// L'elenco degli id sta in IDX_KEY come array JSON (perche' la lib Preferences
// non espone l'enumerazione delle chiavi).
// ---------------------------------------------------------------------------

static bool valid_id(const char* id) {
  size_t n = strlen(id);
  if (n < 1 || n > MACRO_MAX_ID) return false;
  for (const char* p = id; *p; ++p) {
    char c = *p;
    if (!(isalnum((unsigned char)c) || c == '-' || c == '_')) return false;
  }
  return true;
}

static bool load_index(JsonDocument& d) {
  String s = s_prefs.getString(IDX_KEY, "[]");
  return deserializeJson(d, s) == DeserializationError::Ok && d.is<JsonArray>();
}

static void save_index(JsonDocument& d) {
  String out;
  serializeJson(d, out);
  s_prefs.putString(IDX_KEY, out);
}

void macro_begin() {
  s_prefs.begin(NS, false);
  s_begun = true;
}

void macro_fill_ids(JsonArray arr) {
  if (!s_begun) return;
  JsonDocument idx;
  if (!load_index(idx)) return;
  for (JsonVariant v : idx.as<JsonArray>()) {
    const char* id = v | "";
    // filtra eventuali orfani (blob assente)
    if (id[0] && s_prefs.isKey(id)) arr.add(id);
  }
}

bool macro_exists(const char* id) {
  if (!s_begun || !valid_id(id)) return false;
  return s_prefs.isKey(id);
}

String macro_blob(const char* id) {
  if (!s_begun || !valid_id(id)) return "";
  return s_prefs.getString(id, "");
}

bool macro_save(const char* id, JsonArrayConst steps) {
  if (!s_begun || !valid_id(id)) return false;
  if (steps.isNull() || steps.size() > MACRO_MAX_STEPS) return false;

  JsonDocument idx;
  if (!load_index(idx)) return false;
  bool known = s_prefs.isKey(id);
  if (!known && idx.as<JsonArray>().size() >= MACRO_MAX_COUNT) return false;

  String blob;
  serializeJson(steps, blob);
  if (blob.length() > MACRO_MAX_BLOB) return false;
  if ((size_t)s_prefs.putString(id, blob) != blob.length()) return false;

  if (!known) {
    idx.as<JsonArray>().add(id);
    save_index(idx);
  }
  return true;
}

bool macro_del(const char* id) {
  if (!s_begun || !valid_id(id)) return false;
  if (!s_prefs.isKey(id)) return false;
  s_prefs.remove(id);

  JsonDocument idx;
  if (load_index(idx)) {
    JsonArray out = idx.to<JsonArray>(); // ricostruisce filtrando
    JsonDocument fresh;
    JsonArray freshArr = fresh.to<JsonArray>();
    for (const char* x : out) if (strcmp(x, id) != 0) freshArr.add(x);
    save_index(fresh);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Player non-bloccante
// ---------------------------------------------------------------------------

struct Step {
  enum Type { KEY, TEXT, CONSUMER, WAIT } type;
  uint8_t code = 0;   // KEY
  uint8_t mods = 0;   // KEY
  String text;        // TEXT
  uint16_t code16 = 0;// CONSUMER
  uint32_t wait = 0;  // WAIT
};

static bool s_running = false;
static char s_run_id[MACRO_MAX_ID + 1] = {0};
static std::vector<Step> s_steps;
static size_t s_idx = 0;
static size_t s_textPos = 0;

// micro-fasi di esecuzione: giu' -> attesa -> su -> attesa -> step successivo
enum Phase { P_IDLE, P_KEY_DOWN, P_KEY_UP, P_CHAR_DOWN, P_CHAR_UP, P_PAUSE };
static Phase s_phase = P_IDLE;
static uint32_t s_deadline = 0;

static bool parse_steps(JsonArrayConst src, std::vector<Step>& out) {
  if (src.size() > MACRO_MAX_STEPS) return false;
  for (JsonObject o : src) {
    Step st;
    if (!o["k"].isNull()) {
      st.type = Step::KEY;
      st.code = o["k"] | 0;
      st.mods = o["m"] | 0;
      if (!st.code) return false;
    } else if (!o["s"].isNull()) {
      st.type = Step::TEXT;
      st.text = o["s"].as<const char*>();
      if (st.text.length() == 0) return false;
    } else if (!o["c"].isNull()) {
      st.type = Step::CONSUMER;
      st.code16 = o["c"] | 0;
      if (!st.code16) return false;
    } else if (!o["w"].isNull()) {
      st.type = Step::WAIT;
      st.wait = o["w"] | 0;
      if (st.wait > MACRO_MAX_WAIT_MS) st.wait = MACRO_MAX_WAIT_MS;
    } else {
      return false; // step senza chiave nota
    }
    out.push_back(st);
  }
  return true;
}

bool macro_running() { return s_running; }

bool macro_start(const char* id) {
  if (!s_begun || s_running || !macro_exists(id)) return false;

  String blob = s_prefs.getString(id, "");
  if (blob.isEmpty()) return false;

  JsonDocument doc;
  if (deserializeJson(doc, blob) != DeserializationError::Ok) return false;

  s_steps.clear();
  if (!parse_steps(doc.as<JsonArray>(), s_steps)) {
    s_steps.clear();
    return false;
  }

  strlcpy(s_run_id, id, sizeof(s_run_id));
  s_idx = 0;
  s_textPos = 0;
  s_phase = P_IDLE;
  s_running = true;
  return true;
}

// Esegue un tasto tap in due micro-fasi (down / up) con report dedicati:
// non tocca lo stato 6KRO del ws_server, usa report diretti.
static void player_report_key(uint8_t code, uint8_t mods, bool down) {
  uint8_t keys[6] = {0};
  if (down) keys[0] = code;
  kb_send(mods, keys);
}

void macro_tick() {
  if (!s_running) return;

  uint32_t now = millis();

  // attesa in corso?
  if (s_deadline != 0) {
    if ((int32_t)(now - s_deadline) < 0) return;
    s_deadline = 0;
  }

  const Step& st = s_steps[s_idx];

  switch (s_phase) {
    case P_IDLE: {
      switch (st.type) {
        case Step::KEY:
          player_report_key(st.code, st.mods, true);
          s_phase = P_KEY_DOWN;
          s_deadline = now + 8;
          return;
        case Step::TEXT:
          s_textPos = 0;
          s_phase = P_PAUSE; // cade nel testo al prossimo giro
          return;
        case Step::CONSUMER:
          consumer_send(st.code16);
          s_idx++;
          s_deadline = now + 10;
          if (s_idx >= s_steps.size()) goto finished;
          return;
        case Step::WAIT:
          s_idx++;
          if (st.wait > 0) s_deadline = now + st.wait;
          if (s_idx >= s_steps.size()) goto finished;
          return;
      }
      break;
    }

    case P_KEY_DOWN:
      player_report_key(st.code, st.mods, false);
      s_phase = P_KEY_UP;
      s_deadline = now + 8;
      return;

    case P_KEY_UP:
      s_phase = P_IDLE;
      s_idx++;
      s_deadline = now + 8;
      if (s_idx >= s_steps.size()) goto finished;
      return;

    case P_PAUSE: {
      // avanzamento del testo, un carattere per giro
      if (st.type == Step::TEXT && s_textPos < st.text.length()) {
        uint8_t usage; bool shift;
        if (keymap_char(st.text[s_textPos], &usage, &shift)) {
          player_report_key(usage, shift ? 0x02 : 0, true);
          s_phase = P_CHAR_DOWN;
          s_deadline = now + 6;
        } else {
          s_textPos++; // carattere non mappato: salta
          s_deadline = now + 1;
        }
        return;
      }
      // testo finito (o step atteso in P_PAUSE da consumer/testo): prossimo step
      s_phase = P_IDLE;
      s_idx++;
      if (s_idx >= s_steps.size()) goto finished;
      return;
    }

    case P_CHAR_DOWN:
      // rilascio: report con keys vuote e mods azzerati
      player_report_key(0, 0, false);
      s_phase = P_CHAR_UP;
      s_deadline = now + 6;
      return;

    case P_CHAR_UP:
      s_textPos++;
      s_phase = P_PAUSE;
      s_deadline = now + 6;
      return;
  }
  return;

finished:
  s_running = false;
  s_steps.clear();
  s_phase = P_IDLE;
  if (s_on_done) s_on_done(s_run_id);
}
