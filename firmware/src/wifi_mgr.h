#pragma once

#include <Arduino.h>

class AsyncWebServer;

// WiFi: STA con credenziali in NVS (config portal) o, in mancanza, quelle
// compilate (config_local.h). In parallelo resta attivo un AP con captive
// portal per configurare le credenziali da telefono.

void wifi_begin();
void wifi_loop(); // DNS captive portal

// Registra le route del portal (/, /save, probe captive, /wifi-info)
void wifi_portal_routes(class AsyncWebServer& server);
