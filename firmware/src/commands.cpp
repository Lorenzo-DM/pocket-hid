#include "commands.h"
#include <Arduino.h>
#include "config.h"
#include "usb_hid.h"
#include "keymap.h"
#include "macro.h"

// --- Stato tastiera (6-key rollover), condiviso dai trasporti ---
static uint8_t s_mods = 0;
static uint8_t s_keys[6] = {0};

// Broadcasters dei trasporti (per eventi asincroni tipo macro_done)
static void (*s_bc_ws)(const char*) = nullptr;
static void (*s_bc_ble)(const char*) = nullptr;

void commands_set_broadcasters(void (*ws)(const char*), void (*ble)(const char*)) {
  s_bc_ws = ws;
  s_bc_ble = ble;
}

void commands_init() {
  macro_begin();
  macro_set_on_done(on_macro_done);
}

void commands_tick() {
  macro_tick();
}

void commands_kb_clear() {
  s_mods = 0;
  memset(s_keys, 0, sizeof(s_keys));
  kb_send(0, s_keys);
}

static int find_key(uint8_t code) {
  for (int i = 0; i < 6; i++) if (s_keys[i] == code) return i;
  return -1;
}

static bool kb_apply() {
  return kb_send(s_mods, s_keys);
}

static bool kb_key_down(uint8_t code, uint8_t mods) {
  if (code == 0) return false;
  if (find_key(code) < 0) {
    int slot = -1;
    for (int i = 0; i < 6; i++) if (s_keys[i] == 0) { slot = i; break; }
    if (slot < 0) return false; // 7° tasto: ignorato (6KRO)
    s_keys[slot] = code;
  }
  s_mods |= (mods & 0x0F);
  return kb_apply();
}

static bool kb_key_up(uint8_t code, uint8_t mods) {
  if (code != 0) {
    int i = find_key(code);
    if (i >= 0) s_keys[i] = 0;
  }
  s_mods &= ~(mods & 0x0F);
  return kb_apply();
}

static bool kb_key_tap(uint8_t code, uint8_t mods) {
  kb_key_down(code, mods);
  delay(8);
  kb_key_up(code, mods);
  return true;
}

// --- Handler comandi ---

static void handle_key(JsonObject o) {
  uint8_t code = o["code"] | 0;
  uint8_t mods = o["mods"] | 0;
  const char* act = o["act"] | "t";

  if      (!strcmp(act, "d")) kb_key_down(code, mods);
  else if (!strcmp(act, "u")) kb_key_up(code, mods);
  else                        kb_key_tap(code, mods);
}

static void handle_text(const char* s) {
  if (!s) return;
  for (const char* p = s; *p; ++p) {
    uint8_t usage;
    bool shift;
    if (!keymap_char(*p, &usage, &shift)) continue;
    kb_key_tap(usage, shift ? 0x02 : 0);
    delay(6);
  }
}

static void handle_consumer(JsonObject o) {
  uint16_t code = o["code"] | 0;
  if (code) consumer_send(code);
}

static void handle_mouse(JsonObject o) {
  int dx = o["dx"] | 0;
  int dy = o["dy"] | 0;
  if (dx > 127) dx = 127; if (dx < -127) dx = -127;
  if (dy > 127) dy = 127; if (dy < -127) dy = -127;
  mouse_move((int8_t)dx, (int8_t)dy);
}

static void handle_mbtn(JsonObject o) {
  uint8_t b = o["b"] | 0;
  const char* act = o["act"] | "c";
  if      (!strcmp(act, "d")) mouse_button(b, true);
  else if (!strcmp(act, "u")) mouse_button(b, false);
  else { // click = down + up
    mouse_button(b, true);
    delay(10);
    mouse_button(b, false);
  }
}

static void handle_scroll(JsonObject o) {
  int dx = o["dx"] | 0;
  int dy = o["dy"] | 0;
  if (dx > 127) dx = 127; if (dx < -127) dx = -127;
  if (dy > 127) dy = 127; if (dy < -127) dy = -127;
  mouse_scroll((int8_t)dx, (int8_t)dy);
}

void commands_status_fields(JsonDocument& d, const char* type, int ble_clients) {
  d["t"] = type;
  d["v"] = 1;
  d["fw"] = MK_FW_VERSION;
  d["layout"] = "us"; // layout IT/US completo in fase successiva
  d["usb"] = usb_hid_mounted() ? "mounted" : "unmounted";
  if (ble_clients >= 0) d["ble"] = ble_clients;
  JsonArray macros = d["macros"].to<JsonArray>();
  macro_fill_ids(macros);
}

void commands_dispatch(const char* t, JsonObject o, void* ctx, ReplyFn reply) {
  if (!strcmp(t, "key"))              handle_key(o);
  else if (!strcmp(t, "text"))        handle_text(o["s"] | "");
  else if (!strcmp(t, "consumer"))    handle_consumer(o);
  else if (!strcmp(t, "mouse"))       handle_mouse(o);
  else if (!strcmp(t, "mbtn"))        handle_mbtn(o);
  else if (!strcmp(t, "scroll"))      handle_scroll(o);
  else if (!strcmp(t, "macro_run")) {
    if (macro_running()) {
      JsonDocument d; d["t"] = "error"; d["msg"] = "macro gia' in esecuzione";
      String out; serializeJson(d, out); reply(ctx, out.c_str());
      return;
    }
    const char* id = o["id"] | "";
    if (!macro_start(id)) {
      JsonDocument d; d["t"] = "error"; d["msg"] = "macro inesistente o non avviabile";
      String out; serializeJson(d, out); reply(ctx, out.c_str());
    }
    // a fine esecuzione: macro_done via broadcast
  }
  else if (!strcmp(t, "macro_save") || !strcmp(t, "macro_del") || !strcmp(t, "macro_get")) {
    const char* id = o["id"] | "";
    bool ok = false;
    if (!strcmp(t, "macro_save")) ok = macro_save(id, o["steps"].as<JsonArray>());
    else if (!strcmp(t, "macro_del")) ok = macro_del(id);
    else {
      // macro_get: risposta con il contenuto
      if (macro_exists(id)) {
        JsonDocument d;
        d["t"] = "macro_data";
        d["id"] = id;
        DeserializationError err = deserializeJson(d["steps"].to<JsonArray>(), macro_blob(id));
        if (!err) {
          String out; serializeJson(d, out); reply(ctx, out.c_str());
          return;
        }
        JsonDocument e; e["t"] = "error"; e["msg"] = "macro corrotta in NVS";
        String out; serializeJson(e, out); reply(ctx, out.c_str());
        return;
      }
      JsonDocument e; e["t"] = "error"; e["msg"] = "macro inesistente";
      String out; serializeJson(e, out); reply(ctx, out.c_str());
      return;
    }
    if (!ok) {
      JsonDocument d; d["t"] = "error";
      d["msg"] = "operazione macro non riuscita (id/steps non validi o limiti superati)";
      String out; serializeJson(d, out); reply(ctx, out.c_str());
      return;
    }
    // ack: lo state contiene la lista macro aggiornata
    JsonDocument d;
    commands_status_fields(d, "state", -1);
    String out; serializeJson(d, out); reply(ctx, out.c_str());
  }
  else {
    JsonDocument d; d["t"] = "error"; d["msg"] = "tipo messaggio sconosciuto";
    String out; serializeJson(d, out); reply(ctx, out.c_str());
  }
}

// callback dal player macro (contesto loop): broadcast a tutti i trasporti
static void on_macro_done(const char* id) {
  JsonDocument d;
  d["t"] = "macro_done";
  d["id"] = id;
  String out;
  serializeJson(d, out);
  if (s_bc_ws) s_bc_ws(out.c_str());
  if (s_bc_ble) s_bc_ble(out.c_str());
}
