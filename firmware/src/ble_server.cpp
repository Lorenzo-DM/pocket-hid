#include "ble_server.h"
#include <Arduino.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <atomic>
#include <string>
#include "config.h"
#include "commands.h"

// UUID custom (non-standard): app lo usa come fingerprint nello scan
#define MK_BLE_SVC "7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f"
#define MK_BLE_RX  "7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f" // app -> ESP (write)
#define MK_BLE_TX  "7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f" // ESP -> app (notify)

// Il GATT non fa streaming: un messaggio JSON arriva in una o piu' write.
// Cap 2560 B: contiene anche macro_save al limite (2048 B blob + wrapper JSON).
static constexpr size_t BLE_RX_BUF_MAX = 2560;
static constexpr size_t BLE_MAX_PEERS = 3;

struct BlePeer {
  bool used = false;
  uint16_t handle = 0;
  uint16_t mtu = 23;
  bool helloDone = false;
  std::string rxBuf;
};

static NimBLECharacteristic* s_tx = nullptr;
static std::atomic<int> s_clients{0};
static BlePeer s_peers[BLE_MAX_PEERS];
static SemaphoreHandle_t s_peersMux = nullptr;
static SemaphoreHandle_t s_txMux = nullptr;

// ---------------------------------------------------------------------------
// Tabella peer per-handle (thread-safe tra nimble_host e loopTask)
// ---------------------------------------------------------------------------

static BlePeer* find_peer_locked(uint16_t handle) {
  for (auto& p : s_peers) {
    if (p.used && p.handle == handle) return &p;
  }
  return nullptr;
}

static void peer_add(uint16_t handle) {
  if (!s_peersMux || xSemaphoreTake(s_peersMux, portMAX_DELAY) != pdTRUE) return;
  BlePeer* p = find_peer_locked(handle);
  if (!p) {
    for (auto& slot : s_peers) {
      if (!slot.used) {
        p = &slot;
        break;
      }
    }
  }
  if (p) {
    p->used = true;
    p->handle = handle;
    p->mtu = 23;
    p->helloDone = false;
    p->rxBuf.clear();
  }
  xSemaphoreGive(s_peersMux);
}

static bool peer_remove(uint16_t handle) {
  bool wasHello = false;
  if (!s_peersMux || xSemaphoreTake(s_peersMux, portMAX_DELAY) != pdTRUE) return false;
  BlePeer* p = find_peer_locked(handle);
  if (p) {
    wasHello = p->helloDone;
    p->rxBuf.clear();
    p->used = false;
    p->handle = 0;
    p->mtu = 23;
    p->helloDone = false;
  }
  xSemaphoreGive(s_peersMux);
  return wasHello;
}

static void peer_set_mtu(uint16_t handle, uint16_t mtu) {
  if (!s_peersMux || xSemaphoreTake(s_peersMux, portMAX_DELAY) != pdTRUE) return;
  BlePeer* p = find_peer_locked(handle);
  if (p && mtu >= 23) p->mtu = mtu;
  xSemaphoreGive(s_peersMux);
}

static uint16_t peer_get_mtu(uint16_t handle, bool minAll) {
  uint16_t mtu = 247;
  bool found = false;
  if (!s_peersMux || xSemaphoreTake(s_peersMux, portMAX_DELAY) != pdTRUE) return 23;
  if (minAll) {
    for (const auto& p : s_peers) {
      if (p.used) {
        if (!found || p.mtu < mtu) mtu = p.mtu;
        found = true;
      }
    }
  } else {
    BlePeer* p = find_peer_locked(handle);
    if (p) {
      mtu = p->mtu;
      found = true;
    }
  }
  xSemaphoreGive(s_peersMux);
  return found ? mtu : 23;
}

// ---------------------------------------------------------------------------
// Invio TX (chunking automatico oltre MTU-3, compatibile con BleBase)
// ---------------------------------------------------------------------------

static void send_notify_chunked(uint16_t handle, bool broadcast, const char* json) {
  if (!s_tx || !json || s_clients.load(std::memory_order_relaxed) <= 0) return;
  const size_t len = strlen(json);
  if (len == 0) return;

  const uint16_t mtu = peer_get_mtu(handle, broadcast);
  const size_t chunkMax = (mtu > 3) ? static_cast<size_t>(mtu - 3) : 20;

  if (!s_txMux || xSemaphoreTake(s_txMux, pdMS_TO_TICKS(50)) != pdTRUE) return;
  for (size_t off = 0; off < len; off += chunkMax) {
    const size_t n = (len - off > chunkMax) ? chunkMax : (len - off);
    s_tx->setValue(reinterpret_cast<const uint8_t*>(json + off), n);
    s_tx->notify();
    if (off + n < len) {
      vTaskDelay(pdMS_TO_TICKS(5));
    }
  }
  xSemaphoreGive(s_txMux);
}

static void send_error_reply(uint16_t handle, const char* msg) {
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  String out;
  serializeJson(d, out);
  send_notify_chunked(handle, false, out.c_str());
}

// ---------------------------------------------------------------------------
// Callback NimBLE (istanze statiche: nessuna allocazione su heap)
// ---------------------------------------------------------------------------

class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    const uint16_t handle = info.getConnHandle();
    peer_add(handle);
    const int n = s_clients.fetch_add(1, std::memory_order_acq_rel) + 1;
    Serial.printf("[ble] connect (handle %u, totale %d)\n", handle, n);
    // interval 7.5-15ms per mouse fluido, latency 0, timeout 4s
    server->updateConnParams(handle, 6, 12, 0, 400);
  }

  void onMTUChange(uint16_t MTU, NimBLEConnInfo& info) override {
    peer_set_mtu(info.getConnHandle(), MTU);
    Serial.printf("[ble] MTU aggiornato (handle %u): %u\n", info.getConnHandle(), MTU);
  }

  void onDisconnect(NimBLEServer*, NimBLEConnInfo& info, int) override {
    const uint16_t handle = info.getConnHandle();
    const bool wasHello = peer_remove(handle);
    int prev = s_clients.load(std::memory_order_relaxed);
    while (prev > 0 && !s_clients.compare_exchange_weak(prev, prev - 1, std::memory_order_acq_rel)) {}
    const int cur = (prev > 0) ? (prev - 1) : 0;
    if (wasHello) {
      commands_enqueue_input_clear();
    }
    Serial.printf("[ble] disconnect (handle %u, totale %d), riparto con advertising\n", handle, cur);
    NimBLEDevice::getAdvertising()->start();
  }
};

class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* ch, NimBLEConnInfo& info) override {
    const uint16_t handle = info.getConnHandle();
    // Difesa in profondita': accetta comandi solo su link BLE cifrato
    if (!info.isEncrypted()) {
      Serial.printf("[ble] write rifiutata (handle %u): connessione non cifrata\n", handle);
      return;
    }

    std::string data = ch->getValue();
    if (data.empty()) return;

    std::string snapshot;
    bool overflow = false;
    bool hasPeer = false;

    if (s_peersMux && xSemaphoreTake(s_peersMux, portMAX_DELAY) == pdTRUE) {
      BlePeer* p = find_peer_locked(handle);
      if (p) {
        hasPeer = true;
        p->rxBuf.append(data);
        if (p->rxBuf.size() > BLE_RX_BUF_MAX) {
          p->rxBuf.clear();
          overflow = true;
        } else {
          snapshot = p->rxBuf;
        }
      }
      xSemaphoreGive(s_peersMux);
    }

    if (!hasPeer) return;
    if (overflow) {
      Serial.printf("[ble] rx overflow (handle %u), reset buffer\n", handle);
      send_error_reply(handle, "buffer BLE overflow");
      return;
    }

    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, snapshot.data(), snapshot.size());
    if (err == DeserializationError::IncompleteInput) {
      return; // attende chunk successivo
    }

    // Parse concluso (valido o errore definitivo): pulisce il buffer RX
    bool helloDone = false;
    if (s_peersMux && xSemaphoreTake(s_peersMux, portMAX_DELAY) == pdTRUE) {
      BlePeer* p = find_peer_locked(handle);
      if (p) {
        p->rxBuf.clear();
        helloDone = p->helloDone;
      }
      xSemaphoreGive(s_peersMux);
    }

    if (err || !doc.is<JsonObject>()) {
      send_error_reply(handle, "json non valido su BLE");
      return;
    }

    const char* t = doc["t"] | "";

    if (!strcmp(t, "hello")) {
      const int v = doc["v"] | 0;
      if (v != 1) {
        send_error_reply(handle, "versione protocollo non compatibile");
        return;
      }
      if (s_peersMux && xSemaphoreTake(s_peersMux, portMAX_DELAY) == pdTRUE) {
        BlePeer* p = find_peer_locked(handle);
        if (p) p->helloDone = true;
        xSemaphoreGive(s_peersMux);
      }
      if (!commands_enqueue_welcome(Transport::BLE, handle)) {
        send_error_reply(handle, "coda comandi piena");
      }
      return;
    }

    if (!helloDone) {
      send_error_reply(handle, "autenticazione richiesta (inviare hello)");
      return;
    }

    // Hot-path zero-malloc per mouse/scroll
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

    if (!commands_enqueue_json(Transport::BLE, handle, snapshot.data(), snapshot.size())) {
      send_error_reply(handle, "coda comandi piena");
    }
  }
};

static ServerCb s_serverCb;
static RxCb s_rxCb;

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

void ble_server_begin() {
  if (!s_peersMux) s_peersMux = xSemaphoreCreateMutex();
  if (!s_txMux) s_txMux = xSemaphoreCreateMutex();

  commands_set_ble_transport(ble_server_send, ble_server_broadcast);

  NimBLEDevice::init(MK_BLE_NAME);
  NimBLEDevice::setMTU(247);
  // bonding + secure connections; IO "nessuno" = pairing "Just Works":
  // la cifratura (ENC) arriva col pairing, il MITM no (serve display/KB)
  NimBLEDevice::setSecurityAuth(true, false, true);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&s_serverCb);

  NimBLEService* svc = server->createService(MK_BLE_SVC);

  // TX: notify verso l'app (il link e' gia' cifrato dal pairing richiesto su RX)
  s_tx = svc->createCharacteristic(
      MK_BLE_TX,
      NIMBLE_PROPERTY::NOTIFY);

  // RX: write (con e senza risposta per il mouse fire-and-forget), cifrata
  NimBLECharacteristic* rx = svc->createCharacteristic(
      MK_BLE_RX,
      NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE_ENC);
  rx->setCallbacks(&s_rxCb);

  svc->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(MK_BLE_SVC);
  adv->setName(MK_BLE_NAME);
  adv->start();

  Serial.printf("[ble] advertising attivo: \"%s\"\n", MK_BLE_NAME);
}

void ble_server_loop() {
  // NimBLE gestisce gli eventi in task proprio; nessuna azione necessaria.
}

int ble_server_client_count() {
  return s_clients.load(std::memory_order_relaxed);
}

void ble_server_send(uint32_t connHandle, const char* json) {
  send_notify_chunked(static_cast<uint16_t>(connHandle), false, json);
}

void ble_server_broadcast(const char* json) {
  send_notify_chunked(0, true, json);
}
