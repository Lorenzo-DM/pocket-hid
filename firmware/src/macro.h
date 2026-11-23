#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

// Macro: persistenza NVS (Preferences) + player non-bloccante.
// Il player viene avanzato da macro_tick() chiamato in loop(): non usa
// delay() lunghi, così WebSocket e USB restano reattivi durante l'esecuzione.
//
// Formato step: v. docs/protocol.md ("Formato step macro").
// Limiti: id [a-zA-Z0-9_-] 1-20 char, 12 macro, 64 step, blob <= 2 KB.

#define MACRO_MAX_COUNT 12
#define MACRO_MAX_STEPS 64
#define MACRO_MAX_BLOB 2048
#define MACRO_MAX_ID 20
#define MACRO_MAX_WAIT_MS 60000

void macro_begin();

//Lista degli id salvati, nell'ordine di creazione
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
