# PocketHID — Architecture

Virtual keyboard, mouse, media remote, and macro pad: phone app -> ESP32-S3 -> USB-C cable -> target device.

## Data Flow

```text
Phone (PWA / Capacitor Android app)
   |
   +-- BLE (custom GATT, encrypted)    <- works without WiFi
   +-- Home WiFi (WebSocket + mDNS)    <- same LAN (pockethid.local)
   +-- ESP32 Hotspot (captive portal)  <- works offline, self-hosted PWA
         |
         v
      ESP32-S3 ────── USB-C cable ──────> Smart TV / PC / Tablet
      (Composite USB HID:                 (sees a standard hardware
       keyboard + mouse + consumer)        USB keyboard and mouse)
```

- **Output**: USB HID only (TinyUSB). No BLE HID toward the target — zero pairing required on the TV or PC.
- **Input**: custom BLE GATT and WebSocket only.
- **ESP32-side logic**: text-to-keycode mapping (US/IT UTF-8 + AltGr), 6KRO state, and macro execution live in the ESP32 firmware. Transports are thin pipes carrying the same JSON protocol.

## Components

### 1. `/app` — Web App (React + Vite + TypeScript) & Capacitor Android Shell

- **PWA** in the browser: WebSocket (WiFi/hotspot) and Web Bluetooth (Chrome/Edge desktop & Android over HTTPS).
- **Native Android app**: identical codebase inside a Capacitor WebView, using `@capacitor-community/bluetooth-le` for BLE.
- `Capacitor.isNativePlatform()` selects the BLE transport layer at runtime.
- Views: Trackpad, Virtual Keyboard (US/IT layouts, Symbols tab, sticky modifiers, special keys), Media keys, Macros (local storage + JSON import/export + optional ESP32 NVS sync), Settings, and Demo mode.
- Served directly from the ESP32-S3 via LittleFS (pre-compressed with gzip) with offline Service Worker caching.

### 2. `/firmware` — ESP32-S3 (PlatformIO / Arduino)

- **TinyUSB**: composite HID device (6KRO keyboard + mouse + consumer control).
- **NimBLE**: encrypted custom GATT service (RX/TX characteristics, mandatory pairing/bonding, RX/TX chunking).
- **ESPAsyncWebServer**: WebSocket server, LittleFS static hosting for the PWA, on-demand AP captive portal, and WiFi OTA (`/update`).
- **Single-owner `loopTask`**: FreeRTOS command queue decouples network (`async_tcp`) and BLE (`nimble_host`) tasks from USB HID, NVS, and `DNSServer`.
- **On-demand AP + STA**: when connected to home WiFi, the hotspot turns off automatically; the AP activates at boot, when credentials are missing/invalid, or after ~15 s of STA disconnect.

### 3. `/docs` — References

- `protocol.md`: communication protocol specification (source of truth).
- `architecture.md`: this document.
- `troubleshooting.md`: ESP32-S3 TinyUSB, flash size, download mode, and single-USB board notes.

## Transport Comparison

| | BLE | Home WiFi | ESP32 Hotspot |
|---|---|---|---|
| Setup | Pair once | Configure WiFi once | Connect to `PocketHID-XXXX` |
| Phone internet access | Yes | Yes | No |
| Range | ~10 m | Home LAN | ~20–30 m |
| Discovery | Service UUID scan | mDNS (`pockethid.local`) | Captive portal / `192.168.4.1` |

## Security

- **BLE**: mandatory pairing/bonding (`WRITE_ENC` + runtime `isEncrypted()` verification).
- **WiFi / Hotspot**: optional `MK_TOKEN` (constant-time verification) protecting WebSocket, `/save`, and `/update`; WPA2 password on the AP (`pockethid1` by default, configurable in `config.h` / `config_local.h`).

## Known Limitations

- **Target in deep standby**: many TVs do not wake from USB HID input — power on with the original remote.
- **Hotspot mode**: the phone has no internet access while connected to the ESP32 AP.
- **Home WiFi**: phone and ESP32 must be on the same network.
- **Low-power TV USB ports**: some TV USB ports supply limited current; use a powered hub or external power if brownouts occur.
