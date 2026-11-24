#include "macro.h"
#include <Preferences.h>
#include <vector>
#include "usb_hid.h"
#include "keymap.h"

static const char* NS = "mkmac";

static Preferences s_prefs;
static bool s_begun = false;
static void (*s_on_done)(const char*) = nullptr;

// ---------------------------------------------------------------------------
// Struttura step e parser (usato sia al salvataggio sia all'esecuzione)
// ---------------------------------------------------------------------------

struct Step {
  enum Type { KEY, TEXT, CONSUMER, WAIT } type;
  uint8_t code = 0;    // KEY
  uint8_t mods = 0;    // KEY
  String text;         // TEXT
  uint16_t code16 = 0; // CONSUMER
  uint32_t wait = 0;   // WAIT
};

static bool parse_steps(JsonArrayConst src, std::vector<Step>& out) {
  if (src.isNull() || src.size() == 0 || src.size() > MACRO_MAX_STEPS) return false;
  out.clear();
  out.reserve(src.size());
  for (JsonVariantConst item : src) {
    if (!item.is<JsonObjectConst>()) return false;
    JsonObjectConst o = item.as<JsonObjectConst>();
    Step st;
    if (!o["k"].isNull()) {
      st.type = Step::KEY;
      st.code = o["k"] | 0;
      st.mods = static_cast<uint8_t>((o["m"] | 0) & 0x0F);
      if (!st.code && !st.mods) return false;
    } else if (!o["s"].isNull()) {
      if (!o["s"].is<const char*>()) return false;
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
  return !out.empty();
}

// ---------------------------------------------------------------------------
// Storage: ogni macro e' un blob JSON degli steps sotto la chiave = id.
// L'elenco degli id sta in MACRO_IDX_KEY come array JSON (perche' la lib
// Preferences non espone l'enumerazione delle chiavi).
// ---------------------------------------------------------------------------

static bool load_index(JsonDocument& d) {
  String s = s_prefs.getString(MACRO_IDX_KEY, "[]");
  return deserializeJson(d, s) == DeserializationError::Ok && d.is<JsonArray>();
}

static void save_index(JsonDocument& d) {
  String out;
  serializeJson(d, out);
  s_prefs.putString(MACRO_IDX_KEY, out);
}

static bool index_contains(JsonArrayConst arr, const char* id) {
  for (JsonVariantConst v : arr) {
    const char* x = v | "";
    if (strcmp(x, id) == 0) return true;
  }
  return false;
}

void macro_begin() {
  if (s_begun) return;
  s_prefs.begin(NS, false);
  s_begun = true;
}

void macro_fill_ids(JsonArray arr) {
  if (!s_begun) return;
  JsonDocument idx;
  if (!load_index(idx)) return;
  for (JsonVariant v : idx.as<JsonArray>()) {
    const char* id = v | "";
    // filtra eventuali orfani (blob assente) o id non validi
    if (macro_valid_id(id) && s_prefs.isKey(id)) arr.add(id);
  }
}

bool macro_exists(const char* id) {
  if (!s_begun || !macro_valid_id(id)) return false;
  return s_prefs.isKey(id);
}

String macro_blob(const char* id) {
  if (!s_begun || !macro_valid_id(id)) return "";
  return s_prefs.getString(id, "");
}

void macro_set_on_done(void (*cb)(const char* id)) {
  s_on_done = cb;
}

bool macro_save(const char* id, JsonArrayConst steps) {
  if (!s_begun || !macro_valid_id(id)) return false;

  // Valida il formato degli step prima di scrivere in NVS
  std::vector<Step> parsed;
  if (!parse_steps(steps, parsed)) return false;

  JsonDocument idx;
  if (!load_index(idx)) return false;
  JsonArray idxArr = idx.as<JsonArray>();

  const bool inIndex = index_contains(idxArr, id);
  if (!inIndex && idxArr.size() >= MACRO_MAX_COUNT) return false;

  String blob;
  serializeJson(steps, blob);
  if (blob.length() > MACRO_MAX_BLOB) return false;
  if (static_cast<size_t>(s_prefs.putString(id, blob)) != blob.length()) return false;

  if (!inIndex) {
    idxArr.add(id);
    save_index(idx);
  }
  return true;
}

bool macro_del(const char* id) {
  if (!s_begun || !macro_valid_id(id)) return false;
  if (!s_prefs.isKey(id)) return false;
  s_prefs.remove(id);

  JsonDocument idx;
  if (load_index(idx)) {
    JsonArray existing = idx.as<JsonArray>();
    JsonDocument fresh;
    JsonArray freshArr = fresh.to<JsonArray>();
    for (JsonVariant v : existing) {
      const char* x = v | "";
      if (x[0] && strcmp(x, id) != 0) freshArr.add(x);
    }
    save_index(fresh);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Player non-bloccante (avanzato esclusivamente da loopTask)
// ---------------------------------------------------------------------------

static bool s_running = false;
static char s_run_id[MACRO_MAX_ID + 1] = {0};
static std::vector<Step> s_steps;
static size_t s_idx = 0;
static size_t s_textPos = 0;

// micro-fasi di esecuzione: giu' -> attesa -> su -> attesa -> step successivo
enum Phase { P_IDLE, P_KEY_DOWN, P_CONSUMER_DOWN, P_TEXT, P_CHAR_DOWN };
static Phase s_phase = P_IDLE;
static bool s_waiting = false;
static uint32_t s_deadline = 0;

static void schedule_wait(uint32_t now, uint32_t ms) {
  if (ms == 0) {
    s_waiting = false;
    return;
  }
  s_deadline = now + ms;
  s_waiting = true;
}

bool macro_running() { return s_running; }

bool macro_start(const char* id) {
  if (!s_begun || s_running || !macro_exists(id)) return false;

  String blob = s_prefs.getString(id, "");
  if (blob.isEmpty()) return false;

  JsonDocument doc;
  if (deserializeJson(doc, blob) != DeserializationError::Ok) return false;
  if (!doc.is<JsonArray>()) return false;

  s_steps.clear();
  if (!parse_steps(doc.as<JsonArrayConst>(), s_steps) || s_steps.empty()) {
    s_steps.clear();
    return false;
  }

  strlcpy(s_run_id, id, sizeof(s_run_id));
  s_idx = 0;
  s_textPos = 0;
  s_phase = P_IDLE;
  s_waiting = false;
  s_deadline = 0;
  s_running = true;
  return true;
}

// Esegue un tasto tap in due micro-fasi (down / up) con report dedicati:
// non altera lo stato 6KRO interattivo, usa report diretti.
static void player_report_key(uint8_t code, uint8_t mods, bool down) {
  uint8_t keys[6] = {0};
  if (down && code != 0) keys[0] = code;
  kb_send(down ? mods : 0, keys);
}

void macro_tick() {
  if (!s_running) return;

  const uint32_t now = millis();

  // attesa in corso? (confronto signed immune al wraparound di millis())
  if (s_waiting) {
    if (static_cast<int32_t>(now - s_deadline) < 0) return;
    s_waiting = false;
  }

  // Completamento controllato DOPO l'eventuale attesa finale (incluso Step::WAIT finale)
  if (s_idx >= s_steps.size()) {
    s_running = false;
    s_waiting = false;
    s_deadline = 0;
    s_steps.clear();
    s_phase = P_IDLE;
    if (s_on_done) s_on_done(s_run_id);
    return;
  }

  const Step& st = s_steps[s_idx];

  switch (s_phase) {
    case P_IDLE:
      switch (st.type) {
        case Step::KEY:
          player_report_key(st.code, st.mods, true);
          s_phase = P_KEY_DOWN;
          schedule_wait(now, st.code == 0 ? 25 : 8);
          return;

        case Step::TEXT:
          s_textPos = 0;
          s_phase = P_TEXT;
          return;

        case Step::CONSUMER:
          consumer_press(st.code16);
          s_phase = P_CONSUMER_DOWN;
          schedule_wait(now, 5);
          return;

        case Step::WAIT:
          s_idx++;
          schedule_wait(now, st.wait);
          return;
      }
      break;

    case P_KEY_DOWN:
      player_report_key(0, 0, false);
      s_phase = P_IDLE;
      s_idx++;
      schedule_wait(now, 16); // pausa rilascio + gap tra step
      return;

    case P_CONSUMER_DOWN:
      consumer_release();
      s_phase = P_IDLE;
      s_idx++;
      schedule_wait(now, 10);
      return;

    case P_TEXT:
      // salta eventuali caratteri non mappati senza stallo
      while (s_textPos < st.text.length()) {
        uint8_t usage = 0;
        bool shift = false;
        if (keymap_char(st.text[s_textPos], &usage, &shift)) {
          player_report_key(usage, shift ? 0x02 : 0, true);
          s_phase = P_CHAR_DOWN;
          schedule_wait(now, 6);
          return;
        }
        s_textPos++;
      }
      // testo terminato
      s_phase = P_IDLE;
      s_idx++;
      return;

    case P_CHAR_DOWN:
      player_report_key(0, 0, false);
      s_textPos++;
      s_phase = P_TEXT;
      schedule_wait(now, 12); // rilascio + gap tra caratteri
      return;
  }
}
