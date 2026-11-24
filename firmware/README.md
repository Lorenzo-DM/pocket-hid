# Firmware ESP32-S3 — MK-Remote

## Stack

- **PlatformIO** (framework Arduino)
- **TinyUSB** (`Adafruit_TinyUSB_Arduino`): composite HID — keyboard + mouse + consumer control
- **NimBLE** (`NimBLE-Arduino`): servizio GATT custom per i comandi dell'app
- **ESPAsyncWebServer**: WebSocket + captive portal + OTA
- **ArduinoJson**: parsing messaggi (schema in `docs/protocol.md`)

## Struttura

```
firmware/
├── platformio.ini
├── partitions_4mb.csv
├── src/
│   ├── config.h          # WiFi/token/fw version/AP + verifica token (override via config_local.h)
│   ├── main.cpp          # init ordinato + loop principale (single-owner)
│   ├── usb_hid.cpp/.h    # composite HID (TinyUSB): keyboard + mouse + consumer non-bloccante
│   ├── kb_state.cpp/.h   # stato tastiera 6KRO (logica pura, testabile su host)
│   ├── keymap.cpp/.h     # carattere → (keycode, shift), layout US
│   ├── macro_id.h        # limiti macro + validazione ID (esclude "__idx")
│   ├── macro.cpp/.h      # macro: NVS + player non-bloccante su loopTask
│   ├── commands.cpp/.h   # coda FreeRTOS + router comandi condiviso WS/BLE (single-owner)
│   ├── ws_server.cpp/.h  # WebSocket (auth per-client, multi-frame) + HTTP/OTA + PWA LittleFS
│   ├── ble_server.cpp/.h # BLE GATT (NimBLE, link cifrato, chunking RX/TX)
│   └── wifi_mgr.cpp/.h   # credenziali NVS + AP captive portal + mDNS + riconnessione STA
└── test/
    └── test_core/        # test unitari native (`pio test -e native`)
```

## Cosa è implementato

- Composite HID USB (keyboard 6KRO + mouse + consumer/media keys)
- Architettura **single-owner** su `loopTask` con coda FreeRTOS: i task `async_tcp`, `nimble_host` e WiFi non toccano direttamente USB HID, NVS o `DNSServer` e non eseguono `delay()`
- Trasporti comandi: **WebSocket** (`ws://<ip>/ws`, auth per-client con timeout 5 s, multi-frame) e **BLE GATT** (UUID custom, pairing cifrato obbligatorio, MTU 247, chunking RX e TX)
- **Router comandi condiviso** (`commands.cpp`): key, text (non-bloccante, US/ASCII), consumer, mouse (con coalescing), mbtn, scroll, state, macro_run/save/del/get
- **Macro**: persistenza NVS con validazione al salvataggio, player non-bloccante su `loop()`
- **WiFi**: credenziali in NVS (fallback a config compilata), AP `MK-Remote-XXXX` on-demand con captive portal (`/portal` con PWA, `/` senza PWA) e mDNS su rete di casa
- **PWA da LittleFS** (`partitions_4mb.csv`: 2×1,75 MB OTA + 384 KB LittleFS)
- **OTA**: `GET /update` + `POST /update` (multipart, protetto da `MK_TOKEN` se configurato, reboot differito su `loop()`)
- Endpoint HTTP: `/status`, `/wifi-info`, `/update`, `/portal` (o `/`)

Non ancora: layout IT lato firmware.

## Setup

1. Installare PlatformIO (VS Code extension o `pip install platformio`)
2. `pio run` per compilare, `pio run -t uploadfs` per la PWA su LittleFS
3. `pio test -e native` per eseguire i test unitari su host (keymap, 6KRO, validazione macro, token)
4. Flash sulla porta UART (tenere libera la porta USB-OTG per l'HID)
5. Credenziali WiFi: `firmware/src/config_local.h` (gitignored, v. `config_local.h.example`)
   oppure configurarle dal captive portal senza ricompilare

## Nota hardware

Le dev board ESP32-S3 hanno due porte USB-C: usare la **UART** per sviluppo/log e la
**USB-OTG** per l'HID verso il target. La power arriva dalla porta del target.
Nota su questa board: **un solo connettore** USB-C (direct OTG) — v.
`docs/troubleshooting.md` per flash in download mode e log.

## Note versione NimBLE

`NimBLE-Arduino@^2.x` richiede Arduino core 3.x (platform espressif32 recente).
Con core 2.x degradare a `~1.4.3` e adattare le API in `ble_server.cpp`
(nomi callback e firme `notify()` cambiano).
