#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "macro_id.h"

// Macro: persistenza NVS (Preferences) + player non-bloccante.
// Tutte le funzioni vanno chiamate esclusivamente dal loopTask (single-owner).
// Il player viene avanzato da macro_tick() chiamato in loop(): non usa
// delay(), così WebSocket, BLE e USB restano reattivi durante l'esecuzione.
//
// Formato step: v. docs/protocol.md ("Formato step macro").
// Limiti: id [a-zA-Z0-9_-] 1-20 char (escluso "__idx"), 12 macro, 64 step, blob <= 2 KB.

void macro_begin();

// Lista degli id salvati, nell'ordine di creazione
void macro_fill_ids(JsonArray arr);

bool macro_save(const char* id, JsonArrayConst steps);
bool macro_del(const char* id);
bool macro_exists(const char* id);

// Blob JSON grezzo degli step (per macro_get)
String macro_blob(const char* id);

// Ritorna true se avviata; false se inesistente o gia' in esecuzione
bool macro_start(const char* id);
bool macro_running();

// Chiamare da loop()
void macro_tick();

// Callback invocata a fine esecuzione (id della macro)
void macro_set_on_done(void (*cb)(const char* id));
