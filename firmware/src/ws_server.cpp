#include "ws_server.h"
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <LittleFS.h>
#include "config.h"
#include "usb_hid.h"
#include "ble_server.h"
#include "wifi_mgr.h"
#include "commands.h"

static AsyncWebServer server(MK_WS_PORT);
static AsyncWebSocket ws("/ws");

// In questa fase: un client "autenticato" alla volta
static bool s_authed = false;

// --- Utility JSON ---

static void send_doc(AsyncWebSocketClient *client, JsonDocument &d) {
  String out;
  serializeJson(d, out);
  client->text(out);
}

static void send_error(AsyncWebSocketClient *client, const char* msg) {
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  send_doc(client, d);
}

// reply verso il client sorgente (sink per commands_dispatch)
static void reply_ws(void* ctx, const char* json) {
  auto* client = (AsyncWebSocketClient*)ctx;
  if (client) client->text(json);
}

// broadcast a tutti i client WS (macro_done e simili)
static void broadcast_ws(const char* json) {
  ws.textAll(json);
}

// --- Gestione messaggi ---

static void handle_message(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, data, len)) {
    send_error(client, "json non valido");
    return;
  }

  const char* t = doc["t"] | "";

  // Handshake: unico punto di auth (specifico del trasporto WS: token)
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
    JsonDocument w;
    commands_status_fields(w, "welcome", ble_server_client_count());
    send_doc(client, w);
    return;
  }

  if (!s_authed) {
    send_error(client, "autenticazione richiesta (inviare hello)");
    return;
  }

  commands_dispatch(t, doc.as<JsonObject>(), client, reply_ws);
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
      commands_kb_clear();
      break;
    case WS_EVT_DATA:
      handle_message(client, data, len);
      break;
    case WS_EVT_ERROR:
    case WS_EVT_PONG:
      break;
  }
}

// --- OTA (preparazione: upload via POST /update, UI completa in fase 9) ---

static void on_update_upload(AsyncWebServerRequest *req, const String& filename,
                             size_t index, uint8_t *data, size_t len, bool final) {
  if (index == 0) {
    Serial.printf("[ota] upload %s\n", filename.c_str());
    Update.begin();
  }
  if (len) Update.write(data, len);
  if (final) {
    bool ok = Update.end(true);
    Serial.printf("[ota] %s (%u byte)\n", ok ? "completato" : "errore", (unsigned)(index + len));
  }
}

void ws_server_begin(uint16_t port) {
  commands_init();
  commands_set_broadcasters(broadcast_ws, ble_server_broadcast);

  ws.onEvent(on_ws_event);
  server.addHandler(&ws);

  // PWA da LittleFS (fase 8): i file si caricano con `pio run -t uploadfs`.
  // NB: serveStatic e' un catch-all: va registrato DOPO le route API; le
  // richieste non trovate restano 404 (niente redirect, il portal usa le
  // probe registrate in wifi_mgr).
  // Se la PWA e' presente prende la radice "/" e il portal di config WiFi
  // passa a "/portal"; senza PWA il portal resta su "/" (comportamento AP).
  bool fsOk = LittleFS.begin(true);
  if (fsOk) {
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    Serial.printf("[ws] LittleFS ok: %u byte usati / %u\n",
                  (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
  } else {
    Serial.println("[ws] LittleFS non montato: PWA non servita (uploadfs?)");
  }

  // Portal WiFi (config credenziali + captive portal)
  wifi_portal_routes(server, fsOk ? "/portal" : "/");

  // Endpoint HTTP di diagnostica
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest *req) {
    String s = "{\"fw\":\"" MK_FW_VERSION "\",";
    s += "\"usb\":\"";
    s += usb_hid_mounted() ? "mounted" : "unmounted";
    s += "\"}";
    req->send(200, "application/json", s);
  });

  // OTA: form minimale di upload (la UI definitiva e' in fase 9)
  server.on("/update", HTTP_GET, [](AsyncWebServerRequest *req) {
    req->send(200, "text/html",
      "<!doctype html><html lang='it'><head><meta charset='utf-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>MK-Remote OTA</title></head>"
      "<body style='font-family:system-ui;padding:24px'>"
      "<h1>Aggiornamento firmware</h1>"
      "<form method='POST' action='/update' enctype='multipart/form-data'>"
      "<input type='file' name='bin' accept='.bin'>"
      "<button style='display:block;margin-top:12px;padding:12px'>Carica e riavvia</button>"
      "</form></body></html>");
  });
  server.on("/update", HTTP_POST,
    [](AsyncWebServerRequest *req) {
      bool ok = !Update.hasError();
      req->send(ok ? 200 : 500, "text/plain",
                ok ? "OK, riavvio in corso..." : "ERRORE upload");
      if (ok) {
        // piccola pausa per far partire la risposta, poi reboot
        delay(300);
        ESP.restart();
      }
    },
    on_update_upload);

  server.begin();
}

void ws_server_loop() {
  ws.cleanupClients();
}
