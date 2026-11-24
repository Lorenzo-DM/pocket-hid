#include "kb_state.h"
#include <string.h>

void KbState::clear() {
  mods = 0;
  memset(keys, 0, sizeof(keys));
}

int KbState::find_key(uint8_t code) const {
  for (int i = 0; i < 6; ++i) {
    if (keys[i] == code) return i;
  }
  return -1;
}

bool KbState::key_down(uint8_t code, uint8_t mod_mask) {
  const uint8_t m = mod_mask & 0x0F;
  if (code == 0 && m == 0) return false;
  if (code != 0 && find_key(code) < 0) {
    int slot = -1;
    for (int i = 0; i < 6; ++i) {
      if (keys[i] == 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return false; // 7° tasto: ignorato (6KRO)
    keys[slot] = code;
  }
  mods |= m;
  return true;
}

void KbState::key_up(uint8_t code, uint8_t mod_mask) {
  if (code != 0) {
    const int i = find_key(code);
    if (i >= 0) keys[i] = 0;
  }
  mods &= static_cast<uint8_t>(~(mod_mask & 0x0F));
}
