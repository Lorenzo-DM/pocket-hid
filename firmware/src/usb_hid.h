#pragma once

#include <Arduino.h>

// Composite HID: keyboard + mouse + consumer (media keys), via TinyUSB
// Output fisico: porta USB-OTG del S3 collegata al target.

bool usb_hid_begin();
bool usb_hid_mounted();

// --- Keyboard (6-key rollover, mods = bitmask HID) ---
// mods: bit0=Ctrl bit1=Shift bit2=Alt bit3=Gui
bool kb_send(uint8_t mods, const uint8_t keys[6]);
bool kb_clear();

// --- Mouse ---
bool mouse_move(int8_t dx, int8_t dy);
bool mouse_button(uint8_t btn, bool down); // btn: 0=left 1=right 2=middle
bool mouse_release_all();
bool mouse_scroll(int8_t dx, int8_t dy);

// --- Consumer / media keys (page 0x0C) ---
// Primitive non-bloccanti (preferite su loopTask con rilascio schedulato)
bool consumer_press(uint16_t code);
bool consumer_release();
// Invia il codice e subito dopo il rilascio (report a zero, usa delay(5)).
bool consumer_send(uint16_t code);
