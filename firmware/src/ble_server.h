#pragma once

#include <Arduino.h>

// BLE GATT custom (NimBLE): un servizio con RX (app->ESP, write) e TX
// (ESP->app, notify). Il pairing e' obbligatorio: le characteristic
// richiedono cifratura (WRITE_ENC/NOTIFY_ENC), quindi il SO fa il pairing.
// L'handshake hello resta identico agli altri trasporti (docs/protocol.md).

void ble_server_begin();
void ble_server_loop();
int ble_server_client_count();

// Notify a tutti i central iscritti (per macro_done)
void ble_server_broadcast(const char* json);
