#include "usb_hid.h"
#include <Adafruit_TinyUSB.h>

// Descrittori report: un'istanza Adafruit_USBD_HID per interfaccia,
// senza report ID (ogni interfaccia ha il suo descrittore).

static uint8_t const desc_kb[]       = { TUD_HID_REPORT_DESC_KEYBOARD() };
static uint8_t const desc_mouse[]    = { TUD_HID_REPORT_DESC_MOUSE() };
static uint8_t const desc_consumer[] = { TUD_HID_REPORT_DESC_CONSUMER() };

static Adafruit_USBD_HID hid_kb(desc_kb, sizeof(desc_kb), HID_ITF_PROTOCOL_KEYBOARD, 5, false);
static Adafruit_USBD_HID hid_mouse(desc_mouse, sizeof(desc_mouse), HID_ITF_PROTOCOL_NONE, 5, false);
static Adafruit_USBD_HID hid_consumer(desc_consumer, sizeof(desc_consumer), HID_ITF_PROTOCOL_NONE, 10, false);

// Stato corrente dei pulsanti mouse (bit0=left, bit1=right, bit2=middle)
static uint8_t s_buttons = 0;

bool usb_hid_begin() {
  hid_kb.begin();
  hid_mouse.begin();
  hid_consumer.begin();
  return true;
}

bool usb_hid_mounted() {
  return TinyUSBDevice.mounted();
}

// --- Keyboard ---

bool kb_send(uint8_t mods, const uint8_t keys[6]) {
  if (!usb_hid_mounted()) return false;
  return hid_kb.keyboardReport(0, mods, const_cast<uint8_t*>(keys));
}

bool kb_clear() {
  static const uint8_t none[6] = {0};
  return kb_send(0, none);
}

// --- Mouse ---

bool mouse_move(int8_t dx, int8_t dy) {
  if (!usb_hid_mounted()) return false;
  return hid_mouse.mouseReport(0, s_buttons, dx, dy, 0, 0);
}

bool mouse_button(uint8_t btn, bool down) {
  const uint8_t mask = (btn == 0) ? 0x01  // left
                     : (btn == 1) ? 0x02  // right
                     : (btn == 2) ? 0x04  // middle
                     : 0;
  if (mask == 0) return false;
  if (down) s_buttons |= mask;
  else      s_buttons &= ~mask;
  return mouse_move(0, 0);
}

bool mouse_scroll(int8_t dx, int8_t dy) {
  if (!usb_hid_mounted()) return false;
  // wheel = asse Y, pan = asse X
  return hid_mouse.mouseReport(0, s_buttons, 0, 0, dy, dx);
}

// --- Consumer ---

bool consumer_send(uint16_t code) {
  if (!usb_hid_mounted()) return false;
  const uint8_t rep[2] = { (uint8_t)(code & 0xFF), (uint8_t)(code >> 8) };
  bool ok = hid_consumer.sendReport(0, rep, 2);
  delay(5);
  const uint8_t zero[2] = {0, 0};
  hid_consumer.sendReport(0, zero, 2);
  return ok;
}
