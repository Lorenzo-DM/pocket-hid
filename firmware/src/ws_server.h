#pragma once

#include <stdint.h>

// WebSocket server (ESPAsyncWebServer), HTTP API (/status, /update OTA),
// route del captive portal e file statici PWA da LittleFS.
// I comandi ricevuti su /ws vengono validati (auth per-client + framing) e
// accodati verso loopTask tramite commands.h.

void ws_server_begin(uint16_t port);
void ws_server_loop();
