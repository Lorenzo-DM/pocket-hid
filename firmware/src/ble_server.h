#pragma once

#include <stdint.h>

// BLE GATT custom (NimBLE): un servizio con RX (app->ESP, write cifrata) e TX
// (ESP->app, notify con chunking automatico oltre MTU-3).
// Il pairing e' obbligatorio: RX richiede WRITE_ENC e onWrite verifica
// info.isEncrypted(). L'handshake hello resta identico agli altri trasporti.

void ble_server_begin();
void ble_server_loop();
int ble_server_client_count();

// Invio risposta o broadcast verso i central connessi (chiamabile da loopTask)
void ble_server_send(uint32_t connHandle, const char* json);
void ble_server_broadcast(const char* json);
