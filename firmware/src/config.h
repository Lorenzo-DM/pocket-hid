#pragma once

// Configurazione MK-Remote — può essere sovrascritta da build_flags in platformio.ini

#define MK_FW_VERSION "0.1.0"
#define MK_HOSTNAME   "esp32-hid"
#define MK_MDNS_NAME  "esp32-hid"
#define MK_WS_PORT    80

// Credenziali WiFi — MODIFICARE QUI o via -D in build_flags
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

// Token opzionale per WebSocket. Vuoto = nessuna auth (solo per test iniziali).
#ifndef MK_TOKEN
#define MK_TOKEN ""
#endif
