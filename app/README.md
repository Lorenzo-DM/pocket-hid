# PocketHID App (PWA + Capacitor Android)

Single React + TypeScript + Vite codebase that runs both as a **Progressive Web App** (served directly from the ESP32-S3 via LittleFS, or any HTTPS host) and as a **native Android app** via Capacitor.

## Transports

- **WebSocket** (`ws://pockethid.local/ws` or `ws://<ip>/ws`) — works in any browser over home WiFi or the ESP32 hotspot.
- **Bluetooth LE**:
  - In Chrome/Edge (HTTPS required): uses Web Bluetooth (`src/protocol/ble_web.ts`).
  - In the Capacitor Android app: uses `@capacitor-community/bluetooth-le` (`src/protocol/ble_native.ts`).
- **Demo mode**: lets you test the entire UI (trackpad, keyboard, media, macros, debug log) without an ESP32 connected.

## Development

```bash
cd app
npm ci
npm run dev      # local dev server with HMR
npm run lint     # run oxlint
npm run build    # type-check (tsc -b) + production bundle in dist/
```

## Deploying the PWA to ESP32 LittleFS

From the repository root:

```bash
# Build, gzip-compress assets into firmware/data/, and upload to LittleFS
./tools/deploy-pwa.sh
```

## Building the Android App (Capacitor)

Requires Android Studio / Android SDK.

```bash
cd app
npm run cap:sync         # build web bundle and sync into android/
npm run cap:android      # open the project in Android Studio
# or build & run directly on a connected device:
npm run cap:run-android
```
