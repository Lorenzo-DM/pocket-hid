#pragma once

#include <stdint.h>

// Stato tastiera 6-key rollover (6KRO), logica pura senza dipendenze hardware.
struct KbState {
  uint8_t mods = 0;
  uint8_t keys[6] = {0};

  void clear();
  int find_key(uint8_t code) const;

  // Registra pressione; ritorna false se (code==0 && mod_mask==0) oppure
  // se tutti e 6 gli slot sono occupati (7° tasto ignorato).
  // Supporta l'intero byte modificatori HID (incluso AltGr = 0x40).
  bool key_down(uint8_t code, uint8_t mod_mask);

  // Registra rilascio del tasto e dei modificatori indicati.
  void key_up(uint8_t code, uint8_t mod_mask);
};
