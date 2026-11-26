#pragma once

#include <Arduino.h>

class AsyncWebServer;

// WiFi: STA using credentials stored in NVS (config portal) or compiled-in
// fallback (config_local.h). Also manages STA reconnection, mDNS, and an
// on-demand AP (captive portal, WPA2) active only when needed (at boot, with
// missing/invalid credentials, or if STA drops); stops once STA gets an IP.

void wifi_begin();
void wifi_loop(); // Captive portal DNS, WiFi events, mDNS, STA reconnect, reboot

// Registers portal routes (/save, captive probes, /wifi-info). The setup page
// lives at portalBase ("/" when PWA is not mounted, "/portal" otherwise so
// the root serves the PWA).
void wifi_portal_routes(AsyncWebServer& server, const char* portalBase);
