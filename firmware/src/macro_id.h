#pragma once

#include <ctype.h>
#include <stddef.h>
#include <string.h>

#define MACRO_MAX_COUNT   12
#define MACRO_MAX_STEPS   64
#define MACRO_MAX_BLOB    2048
#define MACRO_MAX_ID      20
#define MACRO_MAX_WAIT_MS 60000
#define MACRO_IDX_KEY     "__idx"

// Macro ID validation: [a-zA-Z0-9_-], 1..MACRO_MAX_ID, excludes NVS index key.
inline bool macro_valid_id(const char* id) {
  if (!id) return false;
  const size_t n = strlen(id);
  if (n < 1 || n > MACRO_MAX_ID) return false;
  if (strcmp(id, MACRO_IDX_KEY) == 0) return false;
  for (const char* p = id; *p; ++p) {
    const unsigned char c = static_cast<unsigned char>(*p);
    if (!(isalnum(c) || c == '-' || c == '_')) return false;
  }
  return true;
}
