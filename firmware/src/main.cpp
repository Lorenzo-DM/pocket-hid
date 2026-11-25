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
  // USB TinyUSB: l'ordine e' importante —
  // 1) TinyUSBDevice.begin() alloca i buffer dei descrittori
  // 2) usb_hid_begin() aggiunge le interfacce HID
  // 3) USB.begin() avvia lo stack TinyUSB del core, che serve i descrittori
  //    tramite i callback strong di Adafruit (tud_descriptor_*_cb)
  TinyUSBDevice.begin();
  usb_hid_begin();
  USB.begin();

  Serial.begin(115200);

  Serial.printf("\n[main] PocketHID firmware %s\n", MK_FW_VERSION);
  Serial.printf("[main] USB HID init, mounted=%d\n", usb_hid_mounted());

  // Coda comandi + NVS macro: va inizializzata prima dei trasporti (BLE / WS)
  commands_init();

  // WiFi: STA (NVS o config compilata) + AP captive portal + mDNS
  wifi_begin();

  // BLE GATT custom (pairing cifrato obbligatorio)
  ble_server_begin();

  // WebSocket + HTTP API + OTA + PWA LittleFS
  ws_server_begin(MK_WS_PORT);
  Serial.printf("[main] WebSocket server su porta %d\n", MK_WS_PORT);
}

void loop() {
#ifdef TINYUSB_NEED_POLLING_TASK
  TinyUSBDevice.task();
#endif
  ws_server_loop();
  wifi_loop(); // DNS captive portal, eventi WiFi, mDNS, riconnessione, reboot
  const bool busy = commands_tick();

  // Quando ci sono comandi/text/macro attivi usa tick da 1 ms per latenza minima
  delay(busy ? 1 : 10);
}
