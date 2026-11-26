#pragma once

#include <stddef.h>
#include <stdint.h>

// Keyboard layouts supported by firmware
enum class KeyLayout : uint8_t {
  US = 0,
  IT = 1,
};

// HID modifier bitmask (byte 0 of USB keyboard report)
static constexpr uint8_t HID_MOD_LCTRL  = 0x01;
static constexpr uint8_t HID_MOD_LSHIFT = 0x02;
static constexpr uint8_t HID_MOD_LALT   = 0x04;
static constexpr uint8_t HID_MOD_LGUI   = 0x08;
static constexpr uint8_t HID_MOD_ALTGR  = 0x40; // Right Alt

void keymap_set_layout(KeyLayout layout);
KeyLayout keymap_get_layout();
const char* keymap_layout_name();
bool keymap_parse_layout(const char* name, KeyLayout* out);

// Decode one UTF-8 codepoint from str[0..len-1], set *consumed (>=1 if len>0),
// and map to (HID usage code, HID modifier byte) for the active layout.
bool keymap_next_utf8(const char* str, size_t len, size_t* consumed, uint8_t* usage, uint8_t* mods);

// Backward-compatible wrapper for a single ASCII character (active layout).
bool keymap_char(char c, uint8_t* usage, bool* shift);
