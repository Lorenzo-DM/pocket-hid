#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

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

// Token opzionale per WebSocket, OTA (/update) e config WiFi (/save).
// Vuoto = nessuna auth (solo per rete locale fidata / test iniziali).
#ifndef MK_TOKEN
#define MK_TOKEN ""
#endif

inline bool mk_token_enabled() {
  const char* expected = MK_TOKEN;
  return expected[0] != '\0';
}

// Confronto costante in tempo per verificare il token configurato.
inline bool mk_token_valid(const char* candidate) {
  if (!mk_token_enabled()) return true;
  if (!candidate) return false;
  const char* expected = MK_TOKEN;
  const size_t lenA = strlen(expected);
  const size_t lenB = strlen(candidate);
  uint8_t diff = (lenA != lenB) ? 1 : 0;
  const size_t n = (lenA < lenB) ? lenA : lenB;
  for (size_t i = 0; i < n; ++i) {
    diff |= static_cast<uint8_t>(expected[i] ^ candidate[i]);
  }
  return diff == 0;
}
