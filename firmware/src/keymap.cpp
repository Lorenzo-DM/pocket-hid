#include "keymap.h"
#include <string.h>

// Keyboard HID usage codes (page 0x07)
#define K_A     0x04
#define K_E     0x08
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
#define K_ISO   0x64 // ISO key left of Z (< > on IT keyboard)

static KeyLayout s_layout = KeyLayout::US;

void keymap_set_layout(KeyLayout layout) {
  s_layout = layout;
}

KeyLayout keymap_get_layout() {
  return s_layout;
}

const char* keymap_layout_name() {
  return (s_layout == KeyLayout::IT) ? "it" : "us";
}

bool keymap_parse_layout(const char* name, KeyLayout* out) {
  if (!name || !out) return false;
  if (strcmp(name, "us") == 0 || strcmp(name, "US") == 0) {
    *out = KeyLayout::US;
    return true;
  }
  if (strcmp(name, "it") == 0 || strcmp(name, "IT") == 0) {
    *out = KeyLayout::IT;
    return true;
  }
  return false;
}

static bool map_us(uint32_t cp, uint8_t* usage, uint8_t* mods) {
  *mods = 0;

  if (cp >= 'a' && cp <= 'z') { *usage = static_cast<uint8_t>(K_A + (cp - 'a')); return true; }
  if (cp >= 'A' && cp <= 'Z') { *usage = static_cast<uint8_t>(K_A + (cp - 'A')); *mods = HID_MOD_LSHIFT; return true; }
  if (cp >= '1' && cp <= '9') { *usage = static_cast<uint8_t>(K_ONE + (cp - '1')); return true; }
  if (cp == '0')              { *usage = K_ZERO; return true; }

  switch (cp) {
    case ' ':  *usage = K_SPACE; return true;
    case '\n': *usage = K_ENTER; return true;
    case '\t': *usage = K_TAB;   return true;

    case '!': *usage = K_ONE;     *mods = HID_MOD_LSHIFT; return true;
    case '@': *usage = K_ONE + 1; *mods = HID_MOD_LSHIFT; return true;
    case '#': *usage = K_ONE + 2; *mods = HID_MOD_LSHIFT; return true;
    case '$': *usage = K_ONE + 3; *mods = HID_MOD_LSHIFT; return true;
    case '%': *usage = K_ONE + 4; *mods = HID_MOD_LSHIFT; return true;
    case '^': *usage = K_ONE + 5; *mods = HID_MOD_LSHIFT; return true;
    case '&': *usage = K_ONE + 6; *mods = HID_MOD_LSHIFT; return true;
    case '*': *usage = K_ONE + 7; *mods = HID_MOD_LSHIFT; return true;
    case '(': *usage = K_ONE + 8; *mods = HID_MOD_LSHIFT; return true;
    case ')': *usage = K_ZERO;    *mods = HID_MOD_LSHIFT; return true;

    case '-':  *usage = K_MINUS; return true;
    case '_':  *usage = K_MINUS; *mods = HID_MOD_LSHIFT; return true;
    case '=':  *usage = K_EQUAL; return true;
    case '+':  *usage = K_EQUAL; *mods = HID_MOD_LSHIFT; return true;
    case '[':  *usage = K_LBR;   return true;
    case '{':  *usage = K_LBR;   *mods = HID_MOD_LSHIFT; return true;
    case ']':  *usage = K_RBR;   return true;
    case '}':  *usage = K_RBR;   *mods = HID_MOD_LSHIFT; return true;
    case '\\': *usage = K_BSLH;  return true;
    case '|':  *usage = K_BSLH;  *mods = HID_MOD_LSHIFT; return true;
    case ';':  *usage = K_SEMI;  return true;
    case ':':  *usage = K_SEMI;  *mods = HID_MOD_LSHIFT; return true;
    case '\'': *usage = K_QUOT;  return true;
    case '"':  *usage = K_QUOT;  *mods = HID_MOD_LSHIFT; return true;
    case '`':  *usage = K_GRAVE; return true;
    case '~':  *usage = K_GRAVE; *mods = HID_MOD_LSHIFT; return true;
    case ',':  *usage = K_COMMA; return true;
    case '<':  *usage = K_COMMA; *mods = HID_MOD_LSHIFT; return true;
    case '.':  *usage = K_DOT;   return true;
    case '>':  *usage = K_DOT;   *mods = HID_MOD_LSHIFT; return true;
    case '/':  *usage = K_SLASH; return true;
    case '?':  *usage = K_SLASH; *mods = HID_MOD_LSHIFT; return true;

    default: return false;
  }
}

static bool map_it(uint32_t cp, uint8_t* usage, uint8_t* mods) {
  *mods = 0;

  if (cp >= 'a' && cp <= 'z') { *usage = static_cast<uint8_t>(K_A + (cp - 'a')); return true; }
  if (cp >= 'A' && cp <= 'Z') { *usage = static_cast<uint8_t>(K_A + (cp - 'A')); *mods = HID_MOD_LSHIFT; return true; }
  if (cp >= '1' && cp <= '9') { *usage = static_cast<uint8_t>(K_ONE + (cp - '1')); return true; }
  if (cp == '0')              { *usage = K_ZERO; return true; }

  switch (cp) {
    case ' ':  *usage = K_SPACE; return true;
    case '\n': *usage = K_ENTER; return true;
    case '\t': *usage = K_TAB;   return true;

    // Number row (Shift)
    case '!':    *usage = K_ONE;     *mods = HID_MOD_LSHIFT; return true;
    case '"':    *usage = K_ONE + 1; *mods = HID_MOD_LSHIFT; return true;
    case 0x00A3: *usage = K_ONE + 2; *mods = HID_MOD_LSHIFT; return true; // £
    case '$':    *usage = K_ONE + 3; *mods = HID_MOD_LSHIFT; return true;
    case '%':    *usage = K_ONE + 4; *mods = HID_MOD_LSHIFT; return true;
    case '&':    *usage = K_ONE + 5; *mods = HID_MOD_LSHIFT; return true;
    case '/':    *usage = K_ONE + 6; *mods = HID_MOD_LSHIFT; return true;
    case '(':    *usage = K_ONE + 7; *mods = HID_MOD_LSHIFT; return true;
    case ')':    *usage = K_ONE + 8; *mods = HID_MOD_LSHIFT; return true;
    case '=':    *usage = K_ZERO;    *mods = HID_MOD_LSHIFT; return true;

    // Key left of 1 (\ |)
    case '\\':   *usage = K_GRAVE; return true;
    case '|':    *usage = K_GRAVE; *mods = HID_MOD_LSHIFT; return true;

    // Keys right of 0 (' ? ` and ì ^ ~)
    case '\'':   *usage = K_MINUS; return true;
    case '?':    *usage = K_MINUS; *mods = HID_MOD_LSHIFT; return true;
    case '`':    *usage = K_MINUS; *mods = HID_MOD_ALTGR;  return true;
    case 0x00EC: *usage = K_EQUAL; return true; // ì
    case '^':    *usage = K_EQUAL; *mods = HID_MOD_LSHIFT; return true;
    case '~':    *usage = K_EQUAL; *mods = HID_MOD_ALTGR;  return true;

    // Keys right of P (è é [ { and + * ] })
    case 0x00E8: *usage = K_LBR; return true; // è
    case 0x00E9: *usage = K_LBR; *mods = HID_MOD_LSHIFT; return true; // é
    case '[':    *usage = K_LBR; *mods = HID_MOD_ALTGR;  return true;
    case '{':    *usage = K_LBR; *mods = HID_MOD_LSHIFT | HID_MOD_ALTGR; return true;
    case '+':    *usage = K_RBR; return true;
    case '*':    *usage = K_RBR; *mods = HID_MOD_LSHIFT; return true;
    case ']':    *usage = K_RBR; *mods = HID_MOD_ALTGR;  return true;
    case '}':    *usage = K_RBR; *mods = HID_MOD_LSHIFT | HID_MOD_ALTGR; return true;

    // Keys right of L (ò ç @, à ° #, ù §)
    case 0x00F2: *usage = K_SEMI; return true; // ò
    case 0x00E7: *usage = K_SEMI; *mods = HID_MOD_LSHIFT; return true; // ç
    case '@':    *usage = K_SEMI; *mods = HID_MOD_ALTGR;  return true;
    case 0x00E0: *usage = K_QUOT; return true; // à
    case 0x00B0: *usage = K_QUOT; *mods = HID_MOD_LSHIFT; return true; // °
    case '#':    *usage = K_QUOT; *mods = HID_MOD_ALTGR;  return true;
    case 0x00F9: *usage = K_BSLH; return true; // ù
    case 0x00A7: *usage = K_BSLH; *mods = HID_MOD_LSHIFT; return true; // §

    // Keys right of M (, ;  . :  - _)
    case ',':    *usage = K_COMMA; return true;
    case ';':    *usage = K_COMMA; *mods = HID_MOD_LSHIFT; return true;
    case '.':    *usage = K_DOT;   return true;
    case ':':    *usage = K_DOT;   *mods = HID_MOD_LSHIFT; return true;
    case '-':    *usage = K_SLASH; return true;
    case '_':    *usage = K_SLASH; *mods = HID_MOD_LSHIFT; return true;

    // ISO key left of Z (< >)
    case '<':    *usage = K_ISO; return true;
    case '>':    *usage = K_ISO; *mods = HID_MOD_LSHIFT; return true;

    // Euro (€ = AltGr+E)
    case 0x20AC: *usage = K_E; *mods = HID_MOD_ALTGR; return true;

    default: return false;
  }
}

bool keymap_next_utf8(const char* str, size_t len, size_t* consumed, uint8_t* usage, uint8_t* mods) {
  if (!str || len == 0 || !consumed || !usage || !mods) return false;

  const uint8_t b0 = static_cast<uint8_t>(str[0]);
  uint32_t cp = 0;

  if (b0 < 0x80) {
    *consumed = 1;
    cp = b0;
  } else if ((b0 & 0xE0) == 0xC0 && len >= 2 && (static_cast<uint8_t>(str[1]) & 0xC0) == 0x80) {
    *consumed = 2;
    cp = ((b0 & 0x1F) << 6) | (static_cast<uint8_t>(str[1]) & 0x3F);
  } else if ((b0 & 0xF0) == 0xE0 && len >= 3
             && (static_cast<uint8_t>(str[1]) & 0xC0) == 0x80
             && (static_cast<uint8_t>(str[2]) & 0xC0) == 0x80) {
    *consumed = 3;
    cp = ((b0 & 0x0F) << 12)
       | ((static_cast<uint8_t>(str[1]) & 0x3F) << 6)
       | (static_cast<uint8_t>(str[2]) & 0x3F);
  } else if ((b0 & 0xF8) == 0xF0 && len >= 4
             && (static_cast<uint8_t>(str[1]) & 0xC0) == 0x80
             && (static_cast<uint8_t>(str[2]) & 0xC0) == 0x80
             && (static_cast<uint8_t>(str[3]) & 0xC0) == 0x80) {
    *consumed = 4;
    return false; // emoji / supplementary plane: unmapped
  } else {
    *consumed = 1;
    return false; // invalid UTF-8 byte
  }

  return (s_layout == KeyLayout::IT) ? map_it(cp, usage, mods) : map_us(cp, usage, mods);
}

bool keymap_char(char c, uint8_t* usage, bool* shift) {
  if (!usage || !shift) return false;
  size_t consumed = 0;
  uint8_t mods = 0;
  if (!keymap_next_utf8(&c, 1, &consumed, usage, &mods)) return false;
  *shift = (mods & HID_MOD_LSHIFT) != 0;
  return true;
}
