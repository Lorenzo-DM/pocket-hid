#pragma once

#include <stdint.h>

// WebSocket server (ESPAsyncWebServer), HTTP API (/status, /update OTA),
// captive portal routes, and static PWA assets from LittleFS.
// Commands received on /ws are validated (per-client auth + framing) and
// enqueued to loopTask via commands.h.

void ws_server_begin(uint16_t port);
void ws_server_loop();
