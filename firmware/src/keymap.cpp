#include "keymap.h"

// HID usage codes tastiera (page 0x07)
#define K_A     0x04
#define K_ONE   0x1E
#define K_ZERO  0x27
#define K_ENTER 0x28
#define K_TAB   0x2B
#define K_SPACE 0x2C
#define K_MINUS 0x2D
#define K_EQUAL 0x2E
#define K_LBR   0x2F
#define K_RBR   0x30
#define K_BSLH  0x31
#define K_SEMI  0x33
#define K_QUOT  0x34
#define K_GRAVE 0x35
#define K_COMMA 0x36
#define K_DOT   0x37
#define K_SLASH 0x38

bool keymap_char(char c, uint8_t* usage, bool* shift) {
  *shift = false;

  if (c >= 'a' && c <= 'z') { *usage = K_A + (c - 'a'); return true; }
  if (c >= 'A' && c <= 'Z') { *usage = K_A + (c - 'A'); *shift = true; return true; }
  if (c >= '1' && c <= '9') { *usage = K_ONE + (c - '1'); return true; }
  if (c == '0') { *usage = K_ZERO; return true; }

  switch (c) {
    case ' ':  *usage = K_SPACE; return true;
    case '\n': *usage = K_ENTER; return true;
    case '\t': *usage = K_TAB;   return true;

    case '1': *usage = K_ONE;   *shift = true;  return true;
    case '!': *usage = K_ONE;   *shift = true;  return true;
    case '@': *usage = K_ONE+1; *shift = true;  return true;
    case '#': *usage = K_ONE+2; *shift = true;  return true;
    case '$': *usage = K_ONE+3; *shift = true;  return true;
    case '%': *usage = K_ONE+4; *shift = true;  return true;
    case '^': *usage = K_ONE+5; *shift = true;  return true;
    case '&': *usage = K_ONE+6; *shift = true;  return true;
    case '*': *usage = K_ONE+7; *shift = true;  return true;
    case '(': *usage = K_ONE+8; *shift = true;  return true;
    case ')': *usage = K_ZERO;  *shift = true;  return true;

    case '-': *usage = K_MINUS; return true;
    case '_': *usage = K_MINUS; *shift = true;  return true;
    case '=': *usage = K_EQUAL; return true;
    case '+': *usage = K_EQUAL; *shift = true;  return true;
    case '[': *usage = K_LBR;   return true;
    case '{': *usage = K_LBR;   *shift = true;  return true;
    case ']': *usage = K_RBR;   return true;
    case '}': *usage = K_RBR;   *shift = true;  return true;
    case '\\':*usage = K_BSLH;  return true;
    case '|': *usage = K_BSLH;  *shift = true;  return true;
    case ';': *usage = K_SEMI;  return true;
    case ':': *usage = K_SEMI;  *shift = true;  return true;
    case '\'':*usage = K_QUOT;  return true;
    case '"': *usage = K_QUOT;  *shift = true;  return true;
    case '`': *usage = K_GRAVE; return true;
    case '~': *usage = K_GRAVE; *shift = true;  return true;
    case ',': *usage = K_COMMA; return true;
    case '<': *usage = K_COMMA; *shift = true;  return true;
    case '.': *usage = K_DOT;   return true;
    case '>': *usage = K_DOT;   *shift = true;  return true;
    case '/': *usage = K_SLASH; return true;
    case '?': *usage = K_SLASH; *shift = true;  return true;

    default: return false; // caratteri accentati/non-ASCII: non gestiti in questa fase
  }
}
