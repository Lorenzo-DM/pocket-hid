#pragma once

#include <stdint.h>

// 6-key rollover (6KRO) keyboard state — pure logic with no hardware dependencies.
struct KbState {
  uint8_t mods = 0;
  uint8_t keys[6] = {0};

  void clear();
  int find_key(uint8_t code) const;

  // Record key press; returns false if (code==0 && mod_mask==0) or if all
  // 6 slots are full (7th key ignored).
  // Supports the full HID modifier byte (including AltGr = 0x40).
  bool key_down(uint8_t code, uint8_t mod_mask);

  // Record release of the specified key and modifiers.
  void key_up(uint8_t code, uint8_t mod_mask);
};
