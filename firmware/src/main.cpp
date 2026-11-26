#include <Arduino.h>
#include <Adafruit_TinyUSB.h>
#include <USB.h>
#include "config.h"
#include "usb_hid.h"
#include "commands.h"
#include "ws_server.h"
#include "ble_server.h"
#include "wifi_mgr.h"

void setup() {
  // TinyUSB initialization order matters:
  // 1) TinyUSBDevice.begin() allocates descriptor buffers
  // 2) usb_hid_begin() registers HID interfaces
  // 3) USB.begin() starts the core TinyUSB stack, serving descriptors
  //    through Adafruit's strong callbacks (tud_descriptor_*_cb)
  TinyUSBDevice.begin();
  usb_hid_begin();
  USB.begin();

  Serial.begin(115200);

  Serial.printf("\n[main] PocketHID firmware %s\n", MK_FW_VERSION);
  Serial.printf("[main] USB HID init, mounted=%d\n", usb_hid_mounted());

  // Command queue + NVS macros: must be initialized before transports (BLE / WS)
  commands_init();

  // WiFi: STA (NVS or compiled config) + AP captive portal + mDNS
  wifi_begin();

  // Custom BLE GATT service (mandatory encrypted pairing)
  ble_server_begin();

  // WebSocket + HTTP API + OTA + LittleFS PWA
  ws_server_begin(MK_WS_PORT);
  Serial.printf("[main] WebSocket server listening on port %d\n", MK_WS_PORT);
}

void loop() {
#ifdef TINYUSB_NEED_POLLING_TASK
  TinyUSBDevice.task();
#endif
  ws_server_loop();
  wifi_loop(); // Captive portal DNS, WiFi events, mDNS, reconnect, reboot
  const bool busy = commands_tick();

  // Use 1 ms tick for minimum latency while commands/text/macros are active
  delay(busy ? 1 : 10);
}
