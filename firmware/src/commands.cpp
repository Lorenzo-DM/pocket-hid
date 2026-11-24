#include "commands.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <stdlib.h>
#include <string>
#include "config.h"
#include "usb_hid.h"
#include "kb_state.h"
#include "keymap.h"
#include "macro.h"
#include "ble_server.h"

// ---------------------------------------------------------------------------
// Coda FreeRTOS: ponte thread-safe tra trasporti (async_tcp / nimble_host)
// e loopTask (unico owner di USB HID, KbState, NVS/macro).
// ---------------------------------------------------------------------------

static constexpr size_t CMD_QUEUE_LEN = 48;
static constexpr size_t CMD_MAX_JSON = 2560;
static constexpr size_t TEXT_QUEUE_MAX = 2048;

enum EventKind : uint8_t {
  EV_JSON = 0,
  EV_WELCOME,
  EV_MOUSE,
  EV_SCROLL,
  EV_INPUT_CLEAR,
};

struct QueuedEvent {
  EventKind kind;
  Transport src;
  uint32_t peerId;
  int16_t dx;
  int16_t dy;
  char* payload;
};

static QueueHandle_t s_queue = nullptr;

// Canali di uscita verso i trasporti
static TransportSendFn s_ws_send = nullptr;
static BroadcastFn s_ws_bc = nullptr;
static TransportSendFn s_ble_send = nullptr;
static BroadcastFn s_ble_bc = nullptr;

// Stato tastiera 6KRO (usato esclusivamente da loopTask)
static KbState s_kb;

// Rilasci temporizzati non-bloccanti (tutti su loopTask)
struct PendingKbRelease {
  bool active = false;
  uint8_t code = 0;
  uint8_t mods = 0;
  uint32_t at = 0;
};

struct PendingMbtnRelease {
  bool active = false;
  uint8_t btn = 0;
  uint32_t at = 0;
};

struct PendingConsumerRelease {
  bool active = false;
  uint32_t at = 0;
};

static PendingKbRelease s_kbRel;
static PendingMbtnRelease s_mbtnRel;
static PendingConsumerRelease s_conRel;

// Coda non-bloccante per il comando "text"
enum TextPhase : uint8_t { TP_IDLE = 0, TP_DOWN, TP_GAP };
static std::string s_textBuf;
static size_t s_textPos = 0;
static TextPhase s_textPhase = TP_IDLE;
static uint8_t s_textCurUsage = 0;
static uint8_t s_textCurMods = 0;
static uint32_t s_textDeadline = 0;

// ---------------------------------------------------------------------------
// Utility invio risposte
// ---------------------------------------------------------------------------

static void reply_raw(Transport src, uint32_t peerId, const char* json) {
  if (src == Transport::WS) {
    if (s_ws_send) s_ws_send(peerId, json);
  } else {
    if (s_ble_send) s_ble_send(peerId, json);
  }
}

static void reply_doc(Transport src, uint32_t peerId, const JsonDocument& d) {
  String out;
  serializeJson(d, out);
  reply_raw(src, peerId, out.c_str());
}

static void reply_error(Transport src, uint32_t peerId, const char* msg) {
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  reply_doc(src, peerId, d);
}

static void fill_status_fields(JsonDocument& d, const char* type) {
  d["t"] = type;
  d["v"] = 1;
  d["fw"] = MK_FW_VERSION;
  d["layout"] = "us"; // layout IT/US completo in fase successiva
  d["usb"] = usb_hid_mounted() ? "mounted" : "unmounted";
  d["ble"] = ble_server_client_count();
  JsonArray macros = d["macros"].to<JsonArray>();
  macro_fill_ids(macros);
}

// callback dal player macro (contesto loopTask): broadcast a tutti i trasporti
static void on_macro_done(const char* id) {
  JsonDocument d;
  d["t"] = "macro_done";
  d["id"] = id;
  String out;
  serializeJson(d, out);
  if (s_ws_bc) s_ws_bc(out.c_str());
  if (s_ble_bc) s_ble_bc(out.c_str());
}

// ---------------------------------------------------------------------------
// Setup & configurazione trasporti
// ---------------------------------------------------------------------------

void commands_set_ws_transport(TransportSendFn send, BroadcastFn broadcast) {
  s_ws_send = send;
  s_ws_bc = broadcast;
}

void commands_set_ble_transport(TransportSendFn send, BroadcastFn broadcast) {
  s_ble_send = send;
  s_ble_bc = broadcast;
}

void commands_init() {
  if (!s_queue) {
    s_queue = xQueueCreate(CMD_QUEUE_LEN, sizeof(QueuedEvent));
  }
  macro_begin();
  macro_set_on_done(on_macro_done);
}

// ---------------------------------------------------------------------------
// API thread-safe di accodamento (chiamate da async_tcp / nimble_host)
// ---------------------------------------------------------------------------

static bool push_event(const QueuedEvent& ev) {
  if (!s_queue) return false;
  return xQueueSend(s_queue, &ev, 0) == pdTRUE;
}

bool commands_enqueue_welcome(Transport src, uint32_t peerId) {
  QueuedEvent ev{};
  ev.kind = EV_WELCOME;
  ev.src = src;
  ev.peerId = peerId;
  return push_event(ev);
}

bool commands_enqueue_mouse(int16_t dx, int16_t dy) {
  QueuedEvent ev{};
  ev.kind = EV_MOUSE;
  ev.dx = dx;
  ev.dy = dy;
  return push_event(ev);
}

bool commands_enqueue_scroll(int16_t dx, int16_t dy) {
  QueuedEvent ev{};
  ev.kind = EV_SCROLL;
  ev.dx = dx;
  ev.dy = dy;
  return push_event(ev);
}

bool commands_enqueue_input_clear() {
  QueuedEvent ev{};
  ev.kind = EV_INPUT_CLEAR;
  return push_event(ev);
}

bool commands_enqueue_json(Transport src, uint32_t peerId, const char* data, size_t len) {
  if (!s_queue || !data || len == 0 || len > CMD_MAX_JSON) return false;
  char* copy = static_cast<char*>(malloc(len + 1));
  if (!copy) return false;
  memcpy(copy, data, len);
  copy[len] = '\0';

  QueuedEvent ev{};
  ev.kind = EV_JSON;
  ev.src = src;
  ev.peerId = peerId;
  ev.payload = copy;

  if (!push_event(ev)) {
    free(copy);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Azioni HID non-bloccanti (eseguite esclusivamente su loopTask)
// ---------------------------------------------------------------------------

static int8_t clamp_i8(int32_t v) {
  if (v > 127) return 127;
  if (v < -127) return -127;
  return static_cast<int8_t>(v);
}

static bool kb_apply() {
  return kb_send(s_kb.mods, s_kb.keys);
}

static void flush_kb_release() {
  if (!s_kbRel.active) return;
  s_kbRel.active = false;
  s_kb.key_up(s_kbRel.code, s_kbRel.mods);
  kb_apply();
}

static void flush_mbtn_release() {
  if (!s_mbtnRel.active) return;
  s_mbtnRel.active = false;
  mouse_button(s_mbtnRel.btn, false);
}

static void flush_consumer_release() {
  if (!s_conRel.active) return;
  s_conRel.active = false;
  consumer_release();
}

static void clear_all_inputs() {
  s_kbRel.active = false;
  s_mbtnRel.active = false;
  s_conRel.active = false;
  s_textBuf.clear();
  s_textPos = 0;
  s_textPhase = TP_IDLE;
  s_kb.clear();
  kb_clear();
  mouse_release_all();
  consumer_release();
}

static void handle_key(JsonObject o, uint32_t now) {
  const uint8_t code = o["code"] | 0;
  const uint8_t mods = o["mods"] | 0;
  const char* act = o["act"] | "t";

  flush_kb_release();

  if (!strcmp(act, "d")) {
    if (s_kb.key_down(code, mods)) kb_apply();
  } else if (!strcmp(act, "u")) {
    s_kb.key_up(code, mods);
    kb_apply();
  } else {
    if (!s_kb.key_down(code, mods)) return;
    if (!kb_apply()) {
      s_kb.key_up(code, mods);
      return;
    }
    // Solo modificatore (es. Win/Super): durata maggiore per polling HID (5 ms)
    s_kbRel.active = true;
    s_kbRel.code = code;
    s_kbRel.mods = mods;
    s_kbRel.at = now + (code == 0 ? 25 : 8);
  }
}

static void handle_text(const char* s) {
  if (!s || !s[0]) return;
  const size_t avail = (s_textBuf.size() < TEXT_QUEUE_MAX)
                         ? (TEXT_QUEUE_MAX - s_textBuf.size())
                         : 0;
  if (avail == 0) return;
  const size_t addLen = strnlen(s, avail);
  s_textBuf.append(s, addLen);
}

static void handle_consumer(JsonObject o, uint32_t now) {
  const uint16_t code = o["code"] | 0;
  if (!code) return;
  flush_consumer_release();
  if (consumer_press(code)) {
    s_conRel.active = true;
    s_conRel.at = now + 5;
  }
}

static void handle_mbtn(JsonObject o, uint32_t now) {
  const uint8_t b = o["b"] | 0;
  const char* act = o["act"] | "c";
  flush_mbtn_release();
  if (!strcmp(act, "d")) {
    mouse_button(b, true);
  } else if (!strcmp(act, "u")) {
    mouse_button(b, false);
  } else {
    if (mouse_button(b, true)) {
      s_mbtnRel.active = true;
      s_mbtnRel.btn = b;
      s_mbtnRel.at = now + 10;
    }
  }
}

static void dispatch_json(Transport src, uint32_t peerId, const char* raw, uint32_t now) {
  JsonDocument doc;
  if (deserializeJson(doc, raw) != DeserializationError::Ok || !doc.is<JsonObject>()) {
    reply_error(src, peerId, "json non valido");
    return;
  }

  JsonObject o = doc.as<JsonObject>();
  const char* t = o["t"] | "";

  if (!strcmp(t, "key")) {
    handle_key(o, now);
  } else if (!strcmp(t, "text")) {
    handle_text(o["s"] | "");
  } else if (!strcmp(t, "consumer")) {
    handle_consumer(o, now);
  } else if (!strcmp(t, "mouse")) {
    mouse_move(clamp_i8(o["dx"] | 0), clamp_i8(o["dy"] | 0));
  } else if (!strcmp(t, "mbtn")) {
    handle_mbtn(o, now);
  } else if (!strcmp(t, "scroll")) {
    mouse_scroll(clamp_i8(o["dx"] | 0), clamp_i8(o["dy"] | 0));
  } else if (!strcmp(t, "state")) {
    JsonDocument d;
    fill_status_fields(d, "state");
    reply_doc(src, peerId, d);
  } else if (!strcmp(t, "macro_run")) {
    if (macro_running()) {
      reply_error(src, peerId, "macro gia' in esecuzione");
      return;
    }
    const char* id = o["id"] | "";
    if (!macro_start(id)) {
      reply_error(src, peerId, "macro inesistente o non avviabile");
    }
  } else if (!strcmp(t, "macro_save")) {
    const char* id = o["id"] | "";
    if (!macro_save(id, o["steps"].as<JsonArrayConst>())) {
      reply_error(src, peerId, "operazione macro non riuscita (id/steps non validi o limiti superati)");
      return;
    }
    JsonDocument d;
    fill_status_fields(d, "state");
    reply_doc(src, peerId, d);
  } else if (!strcmp(t, "macro_del")) {
    const char* id = o["id"] | "";
    if (!macro_del(id)) {
      reply_error(src, peerId, "operazione macro non riuscita (id/steps non validi o limiti superati)");
      return;
    }
    JsonDocument d;
    fill_status_fields(d, "state");
    reply_doc(src, peerId, d);
  } else if (!strcmp(t, "macro_get")) {
    const char* id = o["id"] | "";
    if (!macro_exists(id)) {
      reply_error(src, peerId, "macro inesistente");
      return;
    }
    JsonDocument stepsDoc;
    String blob = macro_blob(id);
    if (deserializeJson(stepsDoc, blob) != DeserializationError::Ok || !stepsDoc.is<JsonArray>()) {
      reply_error(src, peerId, "macro corrotta in NVS");
      return;
    }
    JsonDocument d;
    d["t"] = "macro_data";
    d["id"] = id;
    d["steps"] = stepsDoc.as<JsonArray>();
    reply_doc(src, peerId, d);
  } else {
    reply_error(src, peerId, "tipo messaggio sconosciuto");
  }
}

static void tick_text(uint32_t now) {
  if (s_textPhase == TP_DOWN) {
    if (static_cast<int32_t>(now - s_textDeadline) < 0) return;
    s_kb.key_up(s_textCurUsage, s_textCurMods);
    kb_apply();
    s_textPos++;
    s_textPhase = TP_GAP;
    s_textDeadline = now + 6;
    return;
  }

  if (s_textPhase == TP_GAP) {
    if (static_cast<int32_t>(now - s_textDeadline) < 0) return;
    s_textPhase = TP_IDLE;
  }

  // TP_IDLE: consuma il prossimo carattere mappabile
  while (s_textPos < s_textBuf.size()) {
    uint8_t usage = 0;
    bool shift = false;
    if (keymap_char(s_textBuf[s_textPos], &usage, &shift)) {
      const uint8_t mods = shift ? 0x02 : 0;
      if (s_kb.key_down(usage, mods)) {
        kb_apply();
        s_textCurUsage = usage;
        s_textCurMods = mods;
        s_textPhase = TP_DOWN;
        s_textDeadline = now + 8;
        return;
      }
      // 6KRO pieno: riprova al prossimo tick
      return;
    }
    s_textPos++;
  }

  if (s_textPos >= s_textBuf.size() && !s_textBuf.empty()) {
    s_textBuf.clear();
    s_textPos = 0;
  }
}

// ---------------------------------------------------------------------------
// Tick principale (chiamato da loopTask)
// ---------------------------------------------------------------------------

bool commands_tick() {
  const uint32_t now = millis();

  // 1) Scadenze rilasci brevi
  if (s_kbRel.active && static_cast<int32_t>(now - s_kbRel.at) >= 0) {
    flush_kb_release();
  }
  if (s_mbtnRel.active && static_cast<int32_t>(now - s_mbtnRel.at) >= 0) {
    flush_mbtn_release();
  }
  if (s_conRel.active && static_cast<int32_t>(now - s_conRel.at) >= 0) {
    flush_consumer_release();
  }

  // 2) Drena la coda comandi con coalescing di mouse/scroll
  bool drained = false;
  int32_t mouseDx = 0, mouseDy = 0;
  bool hasMouse = false;
  int32_t scrollDx = 0, scrollDy = 0;
  bool hasScroll = false;

  auto flush_mouse_scroll = [&]() {
    if (hasMouse) {
      mouse_move(clamp_i8(mouseDx), clamp_i8(mouseDy));
      mouseDx = mouseDy = 0;
      hasMouse = false;
    }
    if (hasScroll) {
      mouse_scroll(clamp_i8(scrollDx), clamp_i8(scrollDy));
      scrollDx = scrollDy = 0;
      hasScroll = false;
    }
  };

  if (s_queue) {
    QueuedEvent ev{};
    int budget = 16;
    while (budget-- > 0 && xQueueReceive(s_queue, &ev, 0) == pdTRUE) {
      drained = true;
      switch (ev.kind) {
        case EV_MOUSE:
          mouseDx += ev.dx;
          mouseDy += ev.dy;
          hasMouse = true;
          break;

        case EV_SCROLL:
          scrollDx += ev.dx;
          scrollDy += ev.dy;
          hasScroll = true;
          break;

        case EV_WELCOME: {
          flush_mouse_scroll();
          JsonDocument w;
          fill_status_fields(w, "welcome");
          reply_doc(ev.src, ev.peerId, w);
          break;
        }

        case EV_INPUT_CLEAR:
          hasMouse = false;
          hasScroll = false;
          mouseDx = mouseDy = scrollDx = scrollDy = 0;
          clear_all_inputs();
          break;

        case EV_JSON:
          flush_mouse_scroll();
          if (ev.payload) {
            dispatch_json(ev.src, ev.peerId, ev.payload, now);
            free(ev.payload);
          }
          break;
      }
    }
    flush_mouse_scroll();
  }

  // 3) Avanza text non-bloccante e player macro
  tick_text(now);
  macro_tick();

  const bool queuePending = s_queue && uxQueueMessagesWaiting(s_queue) > 0;
  return drained || queuePending || s_kbRel.active || s_mbtnRel.active ||
         s_conRel.active || s_textPhase != TP_IDLE || !s_textBuf.empty() ||
         macro_running();
}
