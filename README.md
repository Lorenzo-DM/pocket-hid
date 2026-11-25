# PocketHID

Turn any **ESP32-S3** into a plug-and-play wireless **USB keyboard, trackpad, media remote, and macro pad** controlled from your phone — with zero software installed on the target TV, PC, or tablet.

```text
Phone (PWA or Android app)
   ├── BLE (custom GATT, encrypted)   ← works offline, no WiFi needed
   ├── Home WiFi (WebSocket + mDNS)   ← same network (pockethid.local)
   └── ESP32 Hotspot (captive portal) ← works offline, built-in PWA
         │
         ▼
     ESP32-S3 ──── USB-C cable ────▶ Smart TV / PC / Tablet
  (Composite USB HID: keyboard + mouse + media keys)
```

## Features

- **True USB HID hardware bridge** (TinyUSB): appears to the target as a standard USB keyboard (6KRO), mouse, and consumer/media controller — works in BIOS, smart TVs, consoles, locked-down PCs, and tablets.
- **Three phone transports**:
  - **Bluetooth LE** (Web Bluetooth on Chrome/Edge, or native Android Capacitor app) with mandatory encrypted pairing.
  - **Home WiFi** (WebSocket + mDNS `pockethid.local`) with optional auth token.
  - **On-demand ESP32 AP** (`PocketHID-XXXX`) with captive portal for WiFi setup.
- **Self-hosted PWA**: the ESP32-S3 serves the web app directly from LittleFS with offline Service Worker caching.
- **Full input suite**:
  - Multi-touch trackpad (relative move, tap/long-press click, two-finger scroll, drag buttons).
  - Virtual keyboard with **US & IT** layouts (UTF-8 + AltGr support), sticky modifiers, function/special keys, and a dedicated Symbols tab.
  - Media & power keys (volume/brightness hold-to-repeat, play/pause, mute, power).
  - Programmable macros (stored locally on the phone or synced to ESP32 NVS, plus a browser-based **Macro Studio** recorder).
- **WiFi OTA updates** at `http://pockethid.local/update`.

## Hardware Requirements

- Any **ESP32-S3** board with **≥ 4 MB flash** and native USB-OTG (e.g., ESP32-S3-DevKitC-1, ESP32-S3-Zero, ESP32-S3 SuperMini).
- A USB data cable (charge-only cables will not enumerate USB HID).

| Board type | Flashing | Target connection |
|---|---|---|
| **Dual USB-C** (UART + OTG) | Use the **UART** port | Plug the **USB-OTG** port into the TV/PC |
| **Single USB-C** (direct OTG) | Hold **BOOT** while plugging in, flash, then **unplug & replug** | Same USB-C port acts as USB HID once running |

> **Note**: The default partition table (`partitions_4mb.csv`) targets 4 MB flash (two 1.75 MB OTA slots + 384 KB LittleFS) and works out of the box on 4 MB, 8 MB, and 16 MB ESP32-S3 boards.

## Quick Start

### Option 1 — Web Flasher (recommended, no tools required)

1. Open the **[PocketHID Web Flasher](https://lorenzo-dm.github.io/pocket-hid/)** in desktop Chrome or Edge.
2. Connect your ESP32-S3 via USB-C and click **Install PocketHID** (flashes both the firmware and the built-in PWA).
3. Plug the ESP32-S3's **USB-OTG** port into your TV or PC.
4. Connect from your phone:
   - **Via BLE**: open the app, switch to Bluetooth, and pair with `PocketHID`.
   - **Via WiFi**: join the `PocketHID-XXXX` hotspot (default password: `pockethid1`), open `http://192.168.4.1/portal` to save your home WiFi credentials, and after reboot open `http://pockethid.local/`.

*(To enable GitHub Pages on a fork, go to **Settings → Pages → Source: GitHub Actions** and run the `Release & Web Flasher` workflow or push a `v*` tag.)*

### Option 2 — Build & Flash from Source

Prerequisites: [Node.js 20+](https://nodejs.org/) and [PlatformIO](https://platformio.org/).

```bash
# 1. Install web app dependencies
cd app && npm ci && cd ..

# 2. (Optional) Pre-configure WiFi / auth token before flashing
cp firmware/src/config_local.h.example firmware/src/config_local.h

# 3. Test, build, and flash both firmware and PWA (macOS / Linux)
./tools/deploy-all.sh
```

Or run each step manually (works on Windows/macOS/Linux):

```bash
# Build PWA and prepare firmware/data/
./tools/deploy-pwa.sh --prep-only

# Build & flash firmware + LittleFS PWA
cd firmware
pio run -e esp32s3 -t upload
pio run -e esp32s3 -t uploadfs
```

## Repository Structure

```text
app/        React + Vite + TypeScript PWA + Capacitor Android shell
firmware/   ESP32-S3 PlatformIO/Arduino firmware (TinyUSB HID, NimBLE, AsyncWebServer)
tools/      Deployment scripts, Web Flasher + Macro Studio (tools/flash/), WS test page
docs/       Protocol specification, architecture, and hardware troubleshooting guide
```

## Documentation

- [Communication Protocol](docs/protocol.md) — JSON message schema, HID keycodes, BLE GATT & WebSocket spec
- [Architecture](docs/architecture.md) — system overview, transports, security model
- [Firmware Guide](firmware/README.md) — modules, partitions, native unit tests, hardware notes
- [App Guide](app/README.md) — PWA development, Demo mode, Android Capacitor build
- [Web Flasher Guide](tools/flash/README.md) — hosting and building ESP Web Tools releases
- [Troubleshooting](docs/troubleshooting.md) — ESP32-S3 TinyUSB, download mode, and single-USB board notes

## License

Licensed under the [Apache License 2.0](LICENSE).
