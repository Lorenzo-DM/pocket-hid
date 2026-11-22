#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <Adafruit_TinyUSB.h>
#include "config.h"
#include "usb_hid.h"
#include "ws_server.h"

static uint32_t s_lastWifiAttempt = 0;
static bool s_mdnsStarted = false;

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n[main] MK-Remote firmware %s\n", MK_FW_VERSION);

  // Composite HID (keyboard + mouse + consumer) su USB-OTG
  usb_hid_begin();
  Serial.printf("[main] USB HID init, mounted=%d\n", usb_hid_mounted());

  // WiFi in modalità station (rete di casa)
  // La modalità hotspot/AP e il captive portal arrivano in una fase successiva.
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(MK_HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  ws_server_begin(MK_WS_PORT);
  Serial.printf("[main] WebSocket server su porta %d\n", MK_WS_PORT);
}

void loop() {
#ifdef TINYUSB_NEED_POLLING_TASK
  TinyUSBDevice.task();
#endif
  ws_server_loop();

  if (WiFi.status() == WL_CONNECTED) {
    if (!s_mdnsStarted) {
      s_mdnsStarted = true;
      Serial.printf("[main] WiFi connesso: %s\n", WiFi.localIP().toString().c_str());
      if (MDNS.begin(MK_MDNS_NAME)) {
        MDNS.addService("http", "tcp", MK_WS_PORT);
        Serial.printf("[main] mDNS attivo: http://%s.local\n", MK_MDNS_NAME);
      }
    }
  } else {
    if (s_mdnsStarted) { s_mdnsStarted = false; MDNS.end(); }
    uint32_t now = millis();
    if (now - s_lastWifiAttempt > 10000) {
      s_lastWifiAttempt = now;
      Serial.println("[main] WiFi non connesso, riprovo...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
  }

  delay(10);
}
