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
├── src/
│   ├── config.h          # WiFi/token/fw version/AP (override via build_flags + config_local.h)
│   ├── main.cpp          # init + loop
│   ├── usb_hid.cpp/.h    # composite HID (TinyUSB): keyboard + mouse + consumer
│   ├── keymap.cpp/.h     # carattere → (keycode, shift), layout US
│   ├── commands.cpp/.h   # router comandi condiviso WS/BLE (stato 6KRO, handler, status)
│   ├── ws_server.cpp/.h  # trasporto WebSocket + portal routes + OTA
│   ├── ble_server.cpp/.h # trasporto BLE GATT (NimBLE, pairing obbligatorio)
│   ├── wifi_mgr.cpp/.h   # credenziali NVS + AP captive portal + config page
│   └── macro.cpp/.h      # macro: NVS + player non-bloccante
```

## Cosa è implementato (fasi 1–6)

- Composite HID USB (keyboard 6KRO + mouse + consumer/media keys)
- Trasporti comandi: **WebSocket** (`ws://<ip>/ws`, token opzionale) e **BLE GATT**
  (UUID custom, RX/TX cifrate → pairing obbligatorio, MTU 247, accumulo JSON multi-write)
- **Router comandi condiviso** (`commands.cpp`): key, text (US/ASCII), consumer, mouse,
  mbtn, scroll, state, macro_run/save/del/get
- **Macro**: persistenza NVS, player non-bloccante su loop()
- **WiFi**: credenziali in NVS (fallback a config compilata), AP `MK-Remote-XXXX` con
  captive portal e pagina di configurazione, mDNS su rete di casa
- **OTA**: `GET /update` + `POST /update` (multipart), partizioni min_spiffs (due slot)
- Endpoint HTTP: `/status`, `/wifi-info`, `/update`, `/` (config portal)

Non ancora: layout IT, client BLE nell'app (fase 7), PWA servita dall'ESP (fase 8),
UI OTA/ESP Web Tools (fase 9).

## Setup

1. Installare PlatformIO (VS Code extension o `pip install platformio`)
2. `pio run` per compilare
3. Flash sulla porta UART (tenere libera la porta USB-OTG per l'HID)
4. Credenziali WiFi: `firmware/src/config_local.h` (gitignored, v. `config_local.h.example`)
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
