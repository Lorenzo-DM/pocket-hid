#pragma once

#include <stddef.h>
#include <stdint.h>

// Layout tastiera supportati dal firmware
enum class KeyLayout : uint8_t {
  US = 0,
  IT = 1,
};

// Bitmask modificatori HID (byte 0 del report tastiera USB)
static constexpr uint8_t HID_MOD_LCTRL  = 0x01;
static constexpr uint8_t HID_MOD_LSHIFT = 0x02;
static constexpr uint8_t HID_MOD_LALT   = 0x04;
static constexpr uint8_t HID_MOD_LGUI   = 0x08;
static constexpr uint8_t HID_MOD_ALTGR  = 0x40; // Right Alt

void keymap_set_layout(KeyLayout layout);
KeyLayout keymap_get_layout();
const char* keymap_layout_name();
bool keymap_parse_layout(const char* name, KeyLayout* out);

// Decodifica un codepoint UTF-8 da str[0..len-1], imposta *consumed (>=1 se len>0)
// e mappa al (HID usage code, HID modifier byte) secondo il layout attivo.
bool keymap_next_utf8(const char* str, size_t len, size_t* consumed, uint8_t* usage, uint8_t* mods);

// Wrapper retrocompatibile per singolo carattere ASCII (layout attivo).
bool keymap_char(char c, uint8_t* usage, bool* shift);
