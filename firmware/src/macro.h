#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "macro_id.h"

// Macros: NVS persistence (Preferences) + non-blocking player.
// All functions must be called exclusively from loopTask (single-owner).
// The player advances via macro_tick() in loop(): no delay() calls, so
// WebSocket, BLE, and USB remain responsive during playback.
//
// Step format: see docs/protocol.md.
// Limits: id [a-zA-Z0-9_-] 1-20 chars (excluding "__idx"), 12 macros, 64 steps, blob <= 2 KB.

void macro_begin();

// List of saved macro IDs in creation order
void macro_fill_ids(JsonArray arr);

bool macro_save(const char* id, JsonArrayConst steps);
bool macro_del(const char* id);
bool macro_exists(const char* id);

// Raw JSON blob of macro steps (for macro_get)
String macro_blob(const char* id);

// Returns true if started; false if missing or already running
bool macro_start(const char* id);
bool macro_running();

// Call from loop()
void macro_tick();

// Callback invoked on completion (receives macro ID)
void macro_set_on_done(void (*cb)(const char* id));
