# Firmware ESP32-S3 — MK-Remote

## Stack

- **PlatformIO** (framework Arduino)
- **TinyUSB** (`Adafruit_TinyUSB_Arduino`): composite HID — keyboard + mouse + consumer control
- **NimBLE** (`NimBLE-Arduino`): servizio GATT custom per i comandi dell'app
- **ESPAsyncWebServer**: WebSocket + file statici PWA + captive portal
- **ArduinoJson**: parsing messaggi (schema in `docs/protocol.md`)

## Struttura

```
firmware/
├── platformio.ini
├── src/
│   ├── config.h          # WiFi/token/fw version (override via build_flags)
│   ├── main.cpp          # init + loop + WiFi/mDNS
│   ├── usb_hid.cpp/.h    # composite HID (TinyUSB): keyboard + mouse + consumer
│   ├── keymap.cpp/.h     # carattere → (keycode, shift), layout US
│   └── ws_server.cpp/.h  # WebSocket + routing comandi (protocol.md)
└── (fasi successive: ble_gatt.cpp, macros.cpp, captive portal, layout IT)
```

Il routing dei comandi vive in `ws_server.cpp`; verrà estratto in un
`command_router.cpp` quando arriverà il canale BLE (una sola logica, più canali).

## Fase 1 — cosa è implementato

- Composite HID USB (keyboard 6KRO + mouse + consumer/media keys)
- WebSocket `ws://<ip>/ws` con handshake `hello`/`welcome` e token opzionale
- Comandi: `key`, `text` (US, ASCII), `consumer`, `mouse`, `mbtn`, `scroll`, `state`
- Endpoint HTTP `GET /status` per diagnostica rapida dal browser
- mDNS `esp32-hid.local` sulla rete di casa

Non ancora: BLE GATT, hotspot/AP, macro, layout IT, servire la PWA.

## Setup

1. Installare PlatformIO (VS Code extension o `pip install platformio`)
2. `pio run` per compilare
3. Flash sulla porta UART (tenere libera la porta USB-OTG per l'HID)

## Nota hardware

Le dev board ESP32-S3 hanno due porte USB-C: usare la **UART** per sviluppo/log e la **USB-OTG** per l'HID verso il target. La power arriva dalla porta del target.
