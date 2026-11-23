#include "ws_server.h"
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include "config.h"
#include "usb_hid.h"
#include "keymap.h"

static AsyncWebServer server(MK_WS_PORT);
static AsyncWebSocket ws("/ws");

// In questa fase: un client "autenticato" alla volta
static bool s_authed = false;

// --- Stato tastiera (6-key rollover) ---
static uint8_t s_mods = 0;
static uint8_t s_keys[6] = {0};

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

// --- Utility JSON ---

static void send_doc(AsyncWebSocketClient *client, JsonDocument &d) {
  String out;
  serializeJson(d, out);
  client->text(out);
}

static void send_status(AsyncWebSocketClient *client, const char* type) {
  JsonDocument d;
  d["t"] = type;
  d["v"] = 1;
  d["fw"] = MK_FW_VERSION;
  d["layout"] = "us"; // layout IT/US completo in fase successiva
  d["usb"] = usb_hid_mounted() ? "mounted" : "unmounted";
  d["ble"] = 0;
  d["macros"].to<JsonArray>(); // vuota in questa fase
  send_doc(client, d);
}

static void send_error(AsyncWebSocketClient *client, const char* msg) {
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  send_doc(client, d);
}

// --- Handler comandi (schema: docs/protocol.md) ---

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

static void handle_message(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, data, len)) {
    send_error(client, "json non valido");
    return;
  }

  const char* t = doc["t"] | "";

  // Handshake: unico punto di auth
  if (!strcmp(t, "hello")) {
    const char* token = doc["token"] | "";
    // il preprocessore non può confrontare stringhe: il check di token
    // vuoto (= auth disabilitata) va fatto a runtime
#if defined(MK_TOKEN)
    const char* kToken = MK_TOKEN;
#else
    const char* kToken = "";
#endif
    if (kToken[0] != '\0' && strcmp(token, kToken) != 0) {
      send_error(client, "token non valido");
      client->close();
      return;
    }
    s_authed = true;
    send_status(client, "welcome");
    return;
  }

  if (!s_authed) {
    send_error(client, "autenticazione richiesta (inviare hello)");
    return;
  }

  if      (!strcmp(t, "key"))      handle_key(doc.as<JsonObject>());
  else if (!strcmp(t, "text"))     handle_text(doc["s"] | "");
  else if (!strcmp(t, "consumer")) handle_consumer(doc.as<JsonObject>());
  else if (!strcmp(t, "mouse"))    handle_mouse(doc.as<JsonObject>());
  else if (!strcmp(t, "mbtn"))     handle_mbtn(doc.as<JsonObject>());
  else if (!strcmp(t, "scroll"))   handle_scroll(doc.as<JsonObject>());
  else if (!strcmp(t, "state"))    send_status(client, "state");
  else if (!strcmp(t, "macro_run")) send_error(client, "macro non ancora supportate");
  else send_error(client, "tipo messaggio sconosciuto");
}

// --- Eventi WebSocket ---

static void on_ws_event(AsyncWebSocket *server, AsyncWebSocketClient *client,
                        AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("[ws] connect %s:%u\n", client->remoteIP().toString().c_str(), client->remotePort());
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("[ws] disconnect\n");
      // cambio client: richiesta nuovo handshake
      s_authed = false;
      kb_clear();
      break;
    case WS_EVT_DATA:
      handle_message(client, data, len);
      break;
    case WS_EVT_ERROR:
    case WS_EVT_PONG:
      break;
  }
}

void ws_server_begin(uint16_t port) {
  ws.onEvent(on_ws_event);
  server.addHandler(&ws);

  // Endpoint HTTP di diagnostica, utile per test rapidi dal browser
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest *req) {
    String s = "{\"fw\":\"" MK_FW_VERSION "\",";
    s += "\"usb\":\"";
    s += usb_hid_mounted() ? "mounted" : "unmounted";
    s += "\"}";
    req->send(200, "application/json", s);
  });

  server.begin();
}

void ws_server_loop() {
  ws.cleanupClients();
}
