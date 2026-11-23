#include "ble_server.h"
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include "config.h"
#include "commands.h"

// UUID custom (non-standard): app lo usa come fingerprint nello scan
#define MK_BLE_SVC "7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f"
#define MK_BLE_RX  "7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f" // app -> ESP (write)
#define MK_BLE_TX  "7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f" // ESP -> app (notify)

// Il GATT non fa streaming: un messaggio JSON arriva completo in una o piu'
// write (lo stack app-chunka se serve). Accumuliamo finche' il parse riesce.
#define RX_BUF_MAX 1024

static NimBLECharacteristic* s_tx = nullptr;
static int s_clients = 0;
static bool s_helloDone = false;
static std::string s_rxBuf;

// ---------------------------------------------------------------------------

static void reply_notify(void* ctx, const char* json) {
  if (!s_tx) return;
  s_tx->setValue((const uint8_t*)json, strlen(json));
  s_tx->notify();
}

static void send_error_reply(const char* msg) {
  JsonDocument d;
  d["t"] = "error";
  d["msg"] = msg;
  String out;
  serializeJson(d, out);
  reply_notify(nullptr, out.c_str());
}

class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    s_clients++;
    Serial.printf("[ble] connect (handle %u, totale %d)\n", info.getConnHandle(), s_clients);
    // interval 7.5-15ms per mouse fluido, latency 0, timeout 4s
    server->updateConnParams(info.getConnHandle(), 6, 12, 0, 400);
  }

  void onDisconnect(NimBLEServer*, NimBLEConnInfo&) override {
    s_clients = (s_clients > 0) ? s_clients - 1 : 0;
    s_helloDone = false;
    s_rxBuf.clear();
    commands_kb_clear();
    Serial.printf("[ble] disconnect (totale %d), riparto con advertising\n", s_clients);
    NimBLEDevice::getAdvertising()->start();
  }
};

class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* ch, NimBLEConnInfo&) override {
    std::string data = ch->getValue();
    if (data.empty()) return;

    s_rxBuf.append(data);
    if (s_rxBuf.size() > RX_BUF_MAX) {
      // overflow: messaggio malformato o chunk perso, si riparte puliti
      Serial.printf("[ble] rx overflow (%u byte), reset buffer\n", (unsigned)s_rxBuf.size());
      s_rxBuf.clear();
      send_error_reply("buffer BLE overflow");
      return;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, s_rxBuf.data(), s_rxBuf.size());
    if (err == DeserializationError::IncompleteInput) {
      return; // chunk successivo
    }
    if (err) {
      s_rxBuf.clear();
      send_error_reply("json non valido su BLE");
      return;
    }

    s_rxBuf.clear();
    const char* t = doc["t"] | "";

    if (!strcmp(t, "hello")) {
      // il pairing fa da auth: basta la versione protocollo
      int v = doc["v"] | 0;
      if (v != 1) {
        send_error_reply("versione protocollo non compatibile");
        return;
      }
      s_helloDone = true;
      JsonDocument w;
      commands_status_fields(w, "welcome", s_clients);
      String out; serializeJson(w, out);
      reply_notify(nullptr, out.c_str());
      return;
    }

    if (!s_helloDone) {
      send_error_reply("autenticazione richiesta (inviare hello)");
      return;
    }

    commands_dispatch(t, doc.as<JsonObject>(), nullptr, reply_notify);
  }
};

// ---------------------------------------------------------------------------

void ble_server_begin() {
  NimBLEDevice::init(MK_BLE_NAME);
  NimBLEDevice::setMTU(247);
  // bonding + secure connections; IO "nessuno" = pairing "Just Works":
  // la cifratura (ENC) arriva col pairing, il MITM no (serve display/KB)
  NimBLEDevice::setSecurityAuth(true, false, true);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCb());

  NimBLEService* svc = server->createService(MK_BLE_SVC);

  // TX: notify verso l'app, cifrato
  s_tx = svc->createCharacteristic(
      MK_BLE_TX,
      NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::NOTIFY_ENC);

  // RX: write (con e senza risposta per il mouse fire-and-forget), cifrato
  NimBLECharacteristic* rx = svc->createCharacteristic(
      MK_BLE_RX,
      NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE_ENC);
  rx->setCallbacks(new RxCb());

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
  return s_clients;
}

void ble_server_broadcast(const char* json) {
  if (!s_tx || s_clients == 0) return;
  s_tx->setValue((const uint8_t*)json, strlen(json));
  s_tx->notify();
}
