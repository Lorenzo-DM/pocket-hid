#pragma once

#include <Arduino.h>

// WebSocket server (ESPAsyncWebServer) + router dei comandi.
// In questa fase i canali BLE e il captive portal non ci sono ancora:
// la logica di routing verrà estratta in command_router al passo BLE.

void ws_server_begin(uint16_t port);
void ws_server_loop();
