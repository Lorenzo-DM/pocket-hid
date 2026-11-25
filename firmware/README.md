# PocketHID Firmware (ESP32-S3)

## Stack

- **PlatformIO** (Arduino framework on `espressif32`)
- **TinyUSB** (`Adafruit_TinyUSB_Arduino`): composite USB HID — keyboard (6KRO) + mouse + consumer control
- **NimBLE** (`NimBLE-Arduino@^2.2.0`): encrypted custom GATT service
- **ESPAsyncWebServer**: WebSocket server, LittleFS PWA hosting, captive portal, and WiFi OTA
- **ArduinoJson**: JSON protocol parsing (see [`docs/protocol.md`](../docs/protocol.md))

## Structure

```text
firmware/
├── platformio.ini
├── partitions_4mb.csv
├── scripts/
│   └── patch_tinyusb.py  # pre-build hook ensuring CFG_TUD_HID >= 3
├── src/
│   ├── config.h          # defaults (override via gitignored config_local.h)
│   ├── main.cpp          # ordered USB/transport init + single-owner loop
│   ├── usb_hid.cpp/.h    # composite TinyUSB HID (keyboard, mouse, consumer)
│   ├── kb_state.cpp/.h   # pure 6KRO keyboard state (host-testable)
│   ├── keymap.cpp/.h     # UTF-8 -> HID keycode + modifiers (US & IT layouts, AltGr)
│   ├── macro_id.h        # macro limits and ID validation
│   ├── macro.cpp/.h      # NVS macro storage + non-blocking player
│   ├── commands.cpp/.h   # FreeRTOS command queue + shared WS/BLE router
│   ├── ws_server.cpp/.h  # WebSocket (per-client auth), HTTP/OTA, LittleFS PWA
│   ├── ble_server.cpp/.h # NimBLE GATT server (encrypted pairing, RX/TX chunking)
│   └── wifi_mgr.cpp/.h   # NVS WiFi creds, on-demand AP captive portal, mDNS
└── test/
    └── test_core/        # native host unit tests (`pio test -e native`)
```

## Architecture Highlights

- **Single-owner `loopTask`**: network (`async_tcp`) and BLE (`nimble_host`) tasks enqueue messages into a FreeRTOS queue; only `loopTask` touches USB HID, NVS, and `DNSServer` — zero `delay()` calls in callbacks.
- **Automatic TinyUSB patch**: `scripts/patch_tinyusb.py` automatically sets `CFG_TUD_HID = 3` before compilation so all three HID interfaces (keyboard, mouse, consumer/media) enumerate reliably.
- **US & IT keymaps**: UTF-8 text typing with Shift/AltGr support and runtime layout switching (`layout` command).
- **4 MB partition layout** (`partitions_4mb.csv`): two 1.75 MB OTA slots + 384 KB LittleFS for the gzipped PWA (NVS stays at `0x9000` so saved WiFi credentials and macros persist across updates).

## Build, Test & Flash

```bash
# Run native unit tests on host (keymap, 6KRO state, macro validation, token)
cd firmware
pio test -e native

# Build firmware
pio run -e esp32s3

# Flash firmware (use UART port on dual-USB boards, or download mode on single-USB boards)
pio run -e esp32s3 -t upload

# Build and flash the LittleFS PWA (prepare firmware/data/ first via ../tools/deploy-pwa.sh --prep-only)
pio run -e esp32s3 -t uploadfs
```

### Optional Pre-Configured WiFi & Auth Token

Copy `firmware/src/config_local.h.example` to `firmware/src/config_local.h` (gitignored) to bake WiFi credentials or a `MK_TOKEN` into the build, or configure WiFi at runtime through the captive portal (`PocketHID-XXXX`, default password `pockethid1`).

## Hardware Notes

- **Dual-USB boards**: use the **UART** port for flashing/serial logs and the **USB-OTG** port for HID toward the target.
- **Single-USB boards** (direct OTG): hold **BOOT** while plugging in USB to enter download mode, flash, then **unplug and replug** the cable to start the firmware. See [`docs/troubleshooting.md`](../docs/troubleshooting.md) for details.
