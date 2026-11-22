#pragma once

#include <Arduino.h>

// Mappa carattere ASCII -> (HID usage code, shift), layout US.
// I caratteri non mappati (accentati, non-ASCII) vengono saltati:
// la gestione layout IT/arricchita entra in una fase successiva.

bool keymap_char(char c, uint8_t* usage, bool* shift);
