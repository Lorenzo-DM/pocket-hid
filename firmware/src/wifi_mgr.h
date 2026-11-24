#pragma once

#include <Arduino.h>

class AsyncWebServer;

// WiFi: STA con credenziali in NVS (config portal) o, in mancanza, quelle
// compilate (config_local.h). Gestisce anche riconnessione STA, mDNS e AP
// (captive portal, WPA2) attivo solo quando serve: all'avvio, con credenziali
// mancanti/errate o STA caduta; si spegne quando lo STA ha preso IP.

void wifi_begin();
void wifi_loop(); // DNS captive portal, eventi WiFi, mDNS, riconnessione STA, reboot

// Registra le route del portal (/save, probe captive, /wifi-info). La pagina
// di config sta su portalBase ("/" se la PWA non e' montata, altrimenti
// "/portal" per lasciare la radice alla PWA).
void wifi_portal_routes(AsyncWebServer& server, const char* portalBase);
