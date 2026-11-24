#include <stdio.h>
#include <stdlib.h>

#ifdef PIO_UNIT_TESTING
#include <unity.h>
#endif

#include "keymap.h"
#include "kb_state.h"
#include "macro_id.h"
#include "config.h"

// Macro di asserzione compatibile sia con PlatformIO Unity sia con compilazione
// diretta via g++/clang++ (senza dipendenze esterne).
#ifdef PIO_UNIT_TESTING
#define EXPECT_TRUE(cond)       TEST_ASSERT_TRUE(cond)
#define EXPECT_FALSE(cond)      TEST_ASSERT_FALSE(cond)
#define EXPECT_EQ(exp, act)     TEST_ASSERT_EQUAL_UINT32((exp), (act))
#else
static int s_failures = 0;
#define EXPECT_TRUE(cond) do { \
  if (!(cond)) { \
    fprintf(stderr, "FAIL %s:%d: expected true: %s\n", __FILE__, __LINE__, #cond); \
    s_failures++; \
  } \
} while (0)
#define EXPECT_FALSE(cond) EXPECT_TRUE(!(cond))
#define EXPECT_EQ(exp, act) do { \
  auto _e = (exp); auto _a = (act); \
  if (_e != _a) { \
    fprintf(stderr, "FAIL %s:%d: expected %u, got %u (%s)\n", \
            __FILE__, __LINE__, (unsigned)_e, (unsigned)_a, #act); \
    s_failures++; \
  } \
} while (0)
#endif

// ---------------------------------------------------------------------------
// Test keymap_char
// ---------------------------------------------------------------------------

static void test_keymap_basic() {
  uint8_t u = 0;
  bool sh = false;

  EXPECT_TRUE(keymap_char('a', &u, &sh));
  EXPECT_EQ(0x04, u);
  EXPECT_FALSE(sh);

  EXPECT_TRUE(keymap_char('Z', &u, &sh));
  EXPECT_EQ(0x1D, u);
  EXPECT_TRUE(sh);

  // '1' deve rimanere non-shifted (regressione del dead code rimosso)
  EXPECT_TRUE(keymap_char('1', &u, &sh));
  EXPECT_EQ(0x1E, u);
  EXPECT_FALSE(sh);

  EXPECT_TRUE(keymap_char('!', &u, &sh));
  EXPECT_EQ(0x1E, u);
  EXPECT_TRUE(sh);

  EXPECT_TRUE(keymap_char('0', &u, &sh));
  EXPECT_EQ(0x27, u);
  EXPECT_FALSE(sh);

  EXPECT_TRUE(keymap_char(')', &u, &sh));
  EXPECT_EQ(0x27, u);
  EXPECT_TRUE(sh);

  EXPECT_TRUE(keymap_char('\n', &u, &sh));
  EXPECT_EQ(0x28, u);
  EXPECT_FALSE(sh);

  EXPECT_TRUE(keymap_char('\t', &u, &sh));
  EXPECT_EQ(0x2B, u);
  EXPECT_FALSE(sh);

  EXPECT_TRUE(keymap_char(' ', &u, &sh));
  EXPECT_EQ(0x2C, u);
  EXPECT_FALSE(sh);

  // Non-ASCII / non mappati e puntatori nulli
  EXPECT_FALSE(keymap_char('\xE0', &u, &sh));
  EXPECT_FALSE(keymap_char('\x00', &u, &sh));
  EXPECT_FALSE(keymap_char('a', nullptr, &sh));
  EXPECT_FALSE(keymap_char('a', &u, nullptr));
}

// ---------------------------------------------------------------------------
// Test KbState (6KRO)
// ---------------------------------------------------------------------------

static void test_kb_state_6kro() {
  KbState kb;

  // Nessun tasto ne' modificatore -> rifiutato
  EXPECT_FALSE(kb.key_down(0, 0));
  EXPECT_FALSE(kb.key_down(0, 0xF0)); // bit alti mascherati

  // Solo modificatore (es. Win/Super = 0x08)
  EXPECT_TRUE(kb.key_down(0, 0x08));
  EXPECT_EQ(0x08, kb.mods);
  kb.key_up(0, 0x08);
  EXPECT_EQ(0x00, kb.mods);

  // 6 tasti contemporanei: tutti accettati
  for (uint8_t i = 0; i < 6; ++i) {
    EXPECT_TRUE(kb.key_down(static_cast<uint8_t>(0x04 + i), 0));
  }
  // Duplicato gia' premuto: idempotente (accettato)
  EXPECT_TRUE(kb.key_down(0x04, 0x01));
  EXPECT_EQ(0x01, kb.mods);

  // 7° tasto distinto: rifiutato (6KRO)
  EXPECT_FALSE(kb.key_down(0x0A, 0));

  // Rilascio di uno slot e riutilizzo
  kb.key_up(0x06, 0x01);
  EXPECT_EQ(0x00, kb.mods);
  EXPECT_TRUE(kb.find_key(0x06) < 0);
  EXPECT_TRUE(kb.key_down(0x0A, 0));
  EXPECT_TRUE(kb.find_key(0x0A) >= 0);

  // Clear completo
  kb.clear();
  EXPECT_EQ(0x00, kb.mods);
  for (int i = 0; i < 6; ++i) {
    EXPECT_EQ(0x00, kb.keys[i]);
  }
}

// ---------------------------------------------------------------------------
// Test macro_valid_id
// ---------------------------------------------------------------------------

static void test_macro_valid_id() {
  EXPECT_TRUE(macro_valid_id("netflix"));
  EXPECT_TRUE(macro_valid_id("A_b-09"));
  EXPECT_TRUE(macro_valid_id("12345678901234567890")); // 20 char esatti

  EXPECT_FALSE(macro_valid_id(nullptr));
  EXPECT_FALSE(macro_valid_id(""));
  EXPECT_FALSE(macro_valid_id("123456789012345678901")); // 21 char (> max)
  EXPECT_FALSE(macro_valid_id("bad id"));
  EXPECT_FALSE(macro_valid_id("bad/id"));
  EXPECT_FALSE(macro_valid_id("bad.id"));

  // Chiave riservata dell'indice NVS: deve essere sempre rifiutata
  EXPECT_FALSE(macro_valid_id("__idx"));
}

// ---------------------------------------------------------------------------
// Test token helper
// ---------------------------------------------------------------------------

static void test_token_validation() {
  if (mk_token_enabled()) {
    EXPECT_TRUE(mk_token_valid(MK_TOKEN));
    EXPECT_FALSE(mk_token_valid(""));
    EXPECT_FALSE(mk_token_valid(nullptr));
    EXPECT_FALSE(mk_token_valid("wrong-token"));
  } else {
    EXPECT_TRUE(mk_token_valid(""));
    EXPECT_TRUE(mk_token_valid("anything"));
    EXPECT_TRUE(mk_token_valid(nullptr));
  }
}

int main() {
#ifdef PIO_UNIT_TESTING
  UNITY_BEGIN();
  RUN_TEST(test_keymap_basic);
  RUN_TEST(test_kb_state_6kro);
  RUN_TEST(test_macro_valid_id);
  RUN_TEST(test_token_validation);
  return UNITY_END();
#else
  test_keymap_basic();
  test_kb_state_6kro();
  test_macro_valid_id();
  test_token_validation();
  if (s_failures == 0) {
    printf("ALL TESTS PASSED (mk_token_enabled=%d)\n", mk_token_enabled() ? 1 : 0);
    return 0;
  }
  fprintf(stderr, "%d TEST FAILURE(S)\n", s_failures);
  return 1;
#endif
}
