#pragma once

#include <stdint.h>

// Custom BLE GATT (NimBLE): one service with RX (app->ESP, encrypted write)
// and TX (ESP->app, notify with automatic chunking beyond MTU-3).
// Pairing is mandatory: RX requires WRITE_ENC and onWrite checks
// info.isEncrypted(). The hello handshake matches the other transports.

void ble_server_begin();
void ble_server_loop();
int ble_server_client_count();

// Send reply or broadcast to connected centrals (safe to call from loopTask)
void ble_server_send(uint32_t connHandle, const char* json);
void ble_server_broadcast(const char* json);
