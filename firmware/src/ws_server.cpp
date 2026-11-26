#include "ws_server.h"
#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <LittleFS.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <atomic>
#include <string>
#include "config.h"
#include "usb_hid.h"
#include "wifi_mgr.h"
#include "commands.h"

static constexpr size_t WS_MAX_CLIENTS = 8;
static constexpr size_t WS_RX_MAX = 2560;
static constexpr uint32_t WS_HELLO_TIMEOUT_MS = 5000;

static AsyncWebServer* s_server = nullptr;
static AsyncWebSocket s_ws("/ws");

struct WsClientSlot {
  bool used = false;
  uint32_t id = 0;
  bool authed = false;
  uint32_t connectedAt = 0;
  std::string rxBuf;
};

static WsClientSlot s_slots[WS_MAX_CLIENTS];
static SemaphoreHandle_t s_slotsMux = nullptr;

// OTA state (upload on async_tcp, deferred reboot on loopTask)
static std::atomic<bool> s_otaActive{false};
static std::atomic<bool> s_otaAuthed{false};
static std::atomic<bool> s_otaUploadReceived{false};
static std::atomic<bool> s_otaOk{false};
static std::atomic<bool> s_otaRebootPending{false};
static uint32_t s_otaRebootAt = 0;

// ---------------------------------------------------------------------------
// JSON / send / HTTP token helpers
// ---------------------------------------------------------------------------

static void send_error(AsyncWebSocketClient* client, const char* msg) {
  if (!client) return;
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  String out;
  serializeJson(d, out);
  client->text(out);
}

static void send_ws(uint32_t clientId, const char* json) {
  s_ws.text(clientId, json);
}

static void broadcast_ws(const char* json) {
  s_ws.textAll(json);
}

static String extract_http_token(AsyncWebServerRequest* req) {
  if (req->hasHeader("X-MK-Token")) return req->header("X-MK-Token");
  if (req->hasParam("token", true)) return req->getParam("token", true)->value();
  if (req->hasParam("token")) return req->getParam("token")->value();
  return "";
}

// ---------------------------------------------------------------------------
// Per-client table (thread-safe between async_tcp and loopTask)
// ---------------------------------------------------------------------------

static WsClientSlot* find_slot_locked(uint32_t id) {
  for (auto& sl : s_slots) {
    if (sl.used && sl.id == id) return &sl;
  }
  return nullptr;
}

static bool slot_add(uint32_t id) {
  if (!s_slotsMux || xSemaphoreTake(s_slotsMux, portMAX_DELAY) != pdTRUE) return false;
  bool ok = false;
  WsClientSlot* existing = find_slot_locked(id);
  if (existing) {
    existing->authed = false;
    existing->connectedAt = millis();
    existing->rxBuf.clear();
    ok = true;
  } else {
    for (auto& sl : s_slots) {
      if (!sl.used) {
        sl.used = true;
        sl.id = id;
        sl.authed = false;
        sl.connectedAt = millis();
        sl.rxBuf.clear();
        ok = true;
        break;
      }
    }
  }
  xSemaphoreGive(s_slotsMux);
  return ok;
}

static bool slot_remove(uint32_t id, bool* wasAuthed) {
  if (wasAuthed) *wasAuthed = false;
  if (!s_slotsMux || xSemaphoreTake(s_slotsMux, portMAX_DELAY) != pdTRUE) return false;
  WsClientSlot* sl = find_slot_locked(id);
  bool found = false;
  if (sl) {
    if (wasAuthed) *wasAuthed = sl->authed;
    sl->rxBuf.clear();
    sl->used = false;
    sl->id = 0;
    sl->authed = false;
    found = true;
  }
  xSemaphoreGive(s_slotsMux);
  return found;
}

static bool slot_is_authed(uint32_t id) {
  if (!s_slotsMux || xSemaphoreTake(s_slotsMux, portMAX_DELAY) != pdTRUE) return false;
  WsClientSlot* sl = find_slot_locked(id);
  const bool authed = sl && sl->authed;
  xSemaphoreGive(s_slotsMux);
  return authed;
}

static void slot_set_authed(uint32_t id, bool authed) {
  if (!s_slotsMux || xSemaphoreTake(s_slotsMux, portMAX_DELAY) != pdTRUE) return;
  WsClientSlot* sl = find_slot_locked(id);
  if (sl) sl->authed = authed;
  xSemaphoreGive(s_slotsMux);
}

// ---------------------------------------------------------------------------
// WebSocket message handling (async_tcp context: no delay, no NVS/HID)
// ---------------------------------------------------------------------------

static void handle_message(AsyncWebSocketClient* client, const char* data, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, data, len) != DeserializationError::Ok || !doc.is<JsonObject>()) {
    send_error(client, "invalid JSON");
    return;
  }

  const char* t = doc["t"] | "";
  const uint32_t clientId = client->id();

  // Handshake: single per-client auth point (token + protocol version)
  if (!strcmp(t, "hello")) {
    if (!doc["v"].isNull() && (doc["v"] | 0) != 1) {
      send_error(client, "unsupported protocol version");
      client->close();
      return;
    }
    const char* token = doc["token"] | "";
    if (!mk_token_valid(token)) {
      send_error(client, "invalid token");
      client->close();
      return;
    }
    slot_set_authed(clientId, true);
    if (!commands_enqueue_welcome(Transport::WS, clientId)) {
      send_error(client, "command queue full");
    }
    return;
  }

  if (!slot_is_authed(clientId)) {
    send_error(client, "authentication required (send hello)");
    return;
  }

  // Hot-path zero-malloc for 60 Hz mouse/scroll
  if (!strcmp(t, "mouse")) {
    commands_enqueue_mouse(static_cast<int16_t>(doc["dx"] | 0),
                           static_cast<int16_t>(doc["dy"] | 0));
    return;
  }
  if (!strcmp(t, "scroll")) {
    commands_enqueue_scroll(static_cast<int16_t>(doc["dx"] | 0),
                            static_cast<int16_t>(doc["dy"] | 0));
    return;
  }

  if (!commands_enqueue_json(Transport::WS, clientId, data, len)) {
    send_error(client, "command queue full or message too large");
  }
}

// ---------------------------------------------------------------------------
// WebSocket events (supports fragmented frames via AwsFrameInfo)
// ---------------------------------------------------------------------------

static void on_ws_event(AsyncWebSocket*, AsyncWebSocketClient* client,
                        AwsEventType type, void* arg, uint8_t* data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("[ws] connect #%u %s:%u\n", static_cast<unsigned>(client->id()),
                    client->remoteIP().toString().c_str(), client->remotePort());
      if (!slot_add(client->id())) {
        send_error(client, "too many connected clients");
        client->close();
      }
      break;

    case WS_EVT_DISCONNECT: {
      bool wasAuthed = false;
      slot_remove(client->id(), &wasAuthed);
      Serial.printf("[ws] disconnect #%u (authed=%d)\n",
                    static_cast<unsigned>(client->id()), wasAuthed ? 1 : 0);
      if (wasAuthed) {
        commands_enqueue_input_clear();
      }
      break;
    }

    case WS_EVT_DATA: {
      auto* info = static_cast<AwsFrameInfo*>(arg);
      if (!info) return;

      // Fast path: single complete text frame
      if (info->final && info->index == 0 && info->len == len) {
        if (info->opcode != WS_TEXT) return;
        if (len > WS_RX_MAX) {
          send_error(client, "message too large");
          return;
        }
        handle_message(client, reinterpret_cast<const char*>(data), len);
        return;
      }

      // Fragmented frames: per-client reassembly buffer
      if (info->index == 0 && info->opcode != WS_TEXT) return;

      std::string complete;
      bool ready = false;
      bool overflow = false;

      if (s_slotsMux && xSemaphoreTake(s_slotsMux, portMAX_DELAY) == pdTRUE) {
        WsClientSlot* sl = find_slot_locked(client->id());
        if (sl) {
          if (info->index == 0) sl->rxBuf.clear();
          if (sl->rxBuf.size() + len > WS_RX_MAX) {
            sl->rxBuf.clear();
            overflow = true;
          } else {
            sl->rxBuf.append(reinterpret_cast<const char*>(data), len);
            if (info->final && (info->index + len) == info->len) {
              complete.swap(sl->rxBuf);
              ready = true;
            }
          }
        }
        xSemaphoreGive(s_slotsMux);
      }

      if (overflow) {
        send_error(client, "message too large");
      } else if (ready) {
        handle_message(client, complete.data(), complete.size());
      }
      break;
    }

    case WS_EVT_ERROR:
    case WS_EVT_PONG:
      break;
  }
}

// ---------------------------------------------------------------------------
// OTA: GET /update + POST /update (protected by MK_TOKEN if configured)
// ---------------------------------------------------------------------------

static void on_update_upload(AsyncWebServerRequest* req, const String& filename,
                             size_t index, uint8_t* data, size_t len, bool final) {
  if (index == 0) {
    s_otaUploadReceived.store(true, std::memory_order_relaxed);
    if (s_otaActive.load(std::memory_order_acquire)) {
      Serial.println("[ota] upload rejected: another OTA is already in progress");
      s_otaAuthed.store(false, std::memory_order_relaxed);
      s_otaOk.store(false, std::memory_order_relaxed);
      return;
    }

    const String token = extract_http_token(req);
    if (!mk_token_valid(token.c_str())) {
      Serial.println("[ota] upload rejected: invalid token");
      s_otaAuthed.store(false, std::memory_order_relaxed);
      s_otaOk.store(false, std::memory_order_relaxed);
      return;
    }

    s_otaAuthed.store(true, std::memory_order_relaxed);
    Serial.printf("[ota] upload %s\n", filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
      Serial.printf("[ota] Update.begin failed (err=%u)\n", (unsigned)Update.getError());
      s_otaOk.store(false, std::memory_order_relaxed);
      return;
    }
    s_otaActive.store(true, std::memory_order_release);
    s_otaOk.store(true, std::memory_order_relaxed);
  }

  if (!s_otaAuthed.load(std::memory_order_relaxed) ||
      !s_otaActive.load(std::memory_order_acquire) ||
      !s_otaOk.load(std::memory_order_relaxed)) {
    return;
  }

  if (len > 0 && Update.write(data, len) != len) {
    Serial.printf("[ota] Update.write failed (err=%u)\n", (unsigned)Update.getError());
    Update.abort();
    s_otaActive.store(false, std::memory_order_release);
    s_otaOk.store(false, std::memory_order_relaxed);
    return;
  }

  if (final) {
    const bool ok = Update.end(true);
    s_otaActive.store(false, std::memory_order_release);
    s_otaOk.store(ok, std::memory_order_relaxed);
    Serial.printf("[ota] %s (%u bytes)\n", ok ? "completed" : "error",
                  static_cast<unsigned>(index + len));
  }
}

static String build_ota_html() {
  String html =
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>PocketHID OTA</title></head>"
    "<body style='font-family:system-ui;padding:24px;max-width:420px;margin:0 auto'>"
    "<h1>Firmware Update</h1>"
    "<form method='POST' action='/update' enctype='multipart/form-data'>";
  if (mk_token_enabled()) {
    // Token field BEFORE file so ESPAsyncWebServer exposes it to on_update_upload at index == 0.
    html += "<p>Token<br><input type='password' name='token' required "
            "style='width:100%;padding:8px;box-sizing:border-box'></p>";
  }
  html +=
    "<p><input type='file' name='bin' accept='.bin' required></p>"
    "<button style='display:block;margin-top:12px;padding:12px;width:100%'>Upload and reboot</button>"
    "</form></body></html>";
  return html;
}

// ---------------------------------------------------------------------------
// Init & loop
// ---------------------------------------------------------------------------

void ws_server_begin(uint16_t port) {
  if (!s_slotsMux) {
    s_slotsMux = xSemaphoreCreateMutex();
  }
  commands_set_ws_transport(send_ws, broadcast_ws);

  if (!s_server) {
    s_server = new AsyncWebServer(port);
  }
  AsyncWebServer& server = *s_server;

  s_ws.onEvent(on_ws_event);
  server.addHandler(&s_ws);

  // Mount LittleFS before deciding portal path ("/" vs "/portal"),
  // but register serveStatic AFTER all API routes because it is a catch-all.
  const bool fsOk = LittleFS.begin(true);
  if (fsOk) {
    Serial.printf("[ws] LittleFS ok: %u bytes used / %u\n",
                  static_cast<unsigned>(LittleFS.usedBytes()),
                  static_cast<unsigned>(LittleFS.totalBytes()));
  } else {
    Serial.println("[ws] LittleFS not mounted: PWA not served (uploadfs?)");
  }

  // WiFi portal (credential setup + captive portal)
  wifi_portal_routes(server, fsOk ? "/portal" : "/");

  // Diagnostic HTTP endpoint
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["fw"] = MK_FW_VERSION;
    d["usb"] = usb_hid_mounted() ? "mounted" : "unmounted";
    String out;
    serializeJson(d, out);
    req->send(200, "application/json", out);
  });

  // OTA: minimal upload form + POST endpoint
  server.on("/update", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send(200, "text/html", build_ota_html());
  });

  server.on(
    "/update", HTTP_POST,
    [](AsyncWebServerRequest* req) {
      const String token = extract_http_token(req);
      const bool authed = mk_token_valid(token.c_str());
      const bool hadUpload = s_otaUploadReceived.exchange(false, std::memory_order_acq_rel);

      if (!authed) {
        if (s_otaActive.exchange(false, std::memory_order_acq_rel)) Update.abort();
        req->send(401, "text/plain", "Invalid token");
        return;
      }
      if (!hadUpload) {
        req->send(400, "text/plain", "No file uploaded");
        return;
      }
      if (s_otaActive.exchange(false, std::memory_order_acq_rel)) {
        Update.abort();
        s_otaOk.store(false, std::memory_order_relaxed);
      }

      const bool ok = s_otaOk.load(std::memory_order_relaxed) && !Update.hasError();
      req->send(ok ? 200 : 500, "text/plain",
                ok ? "OK, rebooting..." : "Upload ERROR");
      if (ok) {
        // Deferred reboot on loopTask (no delay/restart inside HTTP callback)
        s_otaRebootAt = millis() + 400;
        s_otaRebootPending.store(true, std::memory_order_release);
      }
    },
    on_update_upload);

  // PWA from LittleFS (catch-all: registered AFTER all API routes)
  if (fsOk) {
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  }

  server.begin();
}

void ws_server_loop() {
  // Close unauthenticated clients past the hello timeout (5 s)
  uint32_t timedOut[WS_MAX_CLIENTS];
  size_t timedOutCount = 0;
  const uint32_t now = millis();

  if (s_slotsMux && xSemaphoreTake(s_slotsMux, 0) == pdTRUE) {
    for (const auto& sl : s_slots) {
      if (sl.used && !sl.authed &&
          static_cast<int32_t>(now - sl.connectedAt) >= static_cast<int32_t>(WS_HELLO_TIMEOUT_MS)) {
        timedOut[timedOutCount++] = sl.id;
      }
    }
    xSemaphoreGive(s_slotsMux);
  }
  for (size_t i = 0; i < timedOutCount; ++i) {
    Serial.printf("[ws] hello timeout for client #%u, closing\n",
                  static_cast<unsigned>(timedOut[i]));
    s_ws.close(timedOut[i]);
  }

  // Deferred post-OTA reboot
  if (s_otaRebootPending.load(std::memory_order_acquire) &&
      static_cast<int32_t>(now - s_otaRebootAt) >= 0) {
    Serial.println("[ota] rebooting after firmware update");
    delay(50);
    ESP.restart();
  }

  s_ws.cleanupClients();
}
