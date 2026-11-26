#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// PocketHID configuration
// Never commit real credentials: put them in config_local.h (gitignored)
// or pass them via -D in build_flags.
#if __has_include("config_local.h")
#include "config_local.h"
#endif

#define MK_FW_VERSION "0.3.1"
#define MK_HOSTNAME   "pockethid"
#define MK_MDNS_NAME  "pockethid"
#define MK_WS_PORT    80

// BLE
#define MK_BLE_NAME "PocketHID"

// Captive portal hotspot (AP): WPA2, min 8 characters.
// Actual SSID: <MK_AP_BASE_SSID>-XXXX (last 2 MAC bytes)
#define MK_AP_BASE_SSID "PocketHID"
#define MK_AP_PASS      "pockethid1"

// Default WiFi credentials (repo placeholders):
// create firmware/src/config_local.h with real values, see config_local.h.example
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

// Optional auth token for WebSocket, OTA (/update), and WiFi setup (/save).
// Empty = no auth (trusted local network / initial testing only).
#ifndef MK_TOKEN
#define MK_TOKEN ""
#endif

inline bool mk_token_enabled() {
  const char* expected = MK_TOKEN;
  return expected[0] != '\0';
}

// Constant-time comparison to validate the configured token.
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
