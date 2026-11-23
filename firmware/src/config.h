#pragma once

// Configurazione MK-Remote
// Le credenziali reali NON si committano: mettile in config_local.h (gitignored)
// oppure passale via -D in build_flags
#if __has_include("config_local.h")
#include "config_local.h"
#endif

#define MK_FW_VERSION "0.3.0"
#define MK_HOSTNAME   "esp32-hid"
#define MK_MDNS_NAME  "esp32-hid"
#define MK_WS_PORT    80

// BLE
#define MK_BLE_NAME "MK-Remote"

// Hotspot (AP) captive portal: WPA2, min 8 caratteri.
// SSID effettivo: <MK_AP_BASE_SSID>-XXXX (ultimi byte MAC)
#define MK_AP_BASE_SSID "MK-Remote"
#define MK_AP_PASS      "mkremote1"

// Credenziali WiFi di default (placeholder per il repo):
// creare firmware/src/config_local.h con i valori reali, vedi config_local.h.example
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
