# MK-Remote

Tastiera/mouse virtuale per smart TV e PC: app sul telefono → ESP32-S3 → cavo USB → target.

- **ESP32-S3** collegato al target via USB: si presenta come tastiera/mouse HID composita (keyboard + mouse + media keys)
- **App** (PWA + guscio nativo Capacitor, una sola codebase React/TS) si collega all'ESP via:
  - 🔵 BLE (servizio GATT custom) — nessuna rete necessaria
  - 🏠 WiFi di casa (WebSocket) — telefono ed ESP sulla stessa rete
  - 📡 Hotspot ESP (WebSocket + captive portal) — nessuna rete necessaria

## Struttura

```
app/        Web app React+Vite+TS + guscio Capacitor Android (BLE via plugin)
firmware/   Firmware ESP32-S3 (PlatformIO / Arduino): TinyUSB HID, NimBLE, macro, portal, OTA
tools/      mk-test.html (pagine di test) · flash/ (installazione firmware dal browser)
docs/       protocol.md (fonte di verità) · architecture.md · troubleshooting.md · PLAN.md
```

## Documentazione

- [Protocollo di comunicazione](docs/protocol.md)
- [Architettura](docs/architecture.md)
- [Piano di lavoro e stato fasi](docs/PLAN.md)
- [Risoluzione problemi firmware (log sessione debug)](docs/troubleshooting.md)
- [Installazione firmware dal browser](tools/flash/README.md)

## Installazione firmware

1. **Dal browser** (consigliato): pagina `/flash` con ESP Web Tools su un host statico HTTPS — v. [tools/flash](tools/flash/)
2. **PlatformIO**: `pio run -e esp32s3` + flash porta UART + `pio run -t uploadfs` per la PWA
3. **OTA WiFi**: `http://<ip-esp>/update` per gli aggiornamenti successivi

## Stato

Fasi 1–9 implementate (v. [docs/PLAN.md](docs/PLAN.md) per lo stato test). Firmware operativo su hardware reale; app testabile via PWA (WiFi/Web Bluetooth), app Android (Capacitor) e pagina di test standalone `tools/mk-test.html`.
