#pragma once

#include <ArduinoJson.h>

// Router comandi condiviso dai trasporti (WebSocket, BLE). Estratto da
// ws_server al passaggio al BLE (v. piano, "Deposito").
// Il trasporto gestisce hello/auth (token su WS, pairing su BLE) e il parse;
// qui stanno gli handler, lo stato 6KRO della tastiera e lo status comune.

// Sink per le risposte: il trasporto invia il JSON al client sorgente.
typedef void (*ReplyFn)(void* ctx, const char* json);

void commands_init();
void commands_tick(); // player macro

// Campi comuni di welcome/state nel doc aperto (t, v, fw, layout, usb, ble, macros)
void commands_status_fields(JsonDocument& d, const char* type, int ble_clients);

// Esegue un comando gia' parserizzato; le risposte (errori, state) escono
// sul sink. "hello" NON arriva qui.
void commands_dispatch(const char* t, JsonObject o, void* ctx, ReplyFn reply);

// Rilascio tastiera al cambio client
void commands_kb_clear();

// Broadcast asincroni (es. macro_done): registri i canali dei trasporti.
// Un canale puo' essere NULL (trasporto assente).
void commands_set_broadcasters(void (*ws)(const char*), void (*ble)(const char*));
