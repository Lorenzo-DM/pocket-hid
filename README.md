# MK-Remote

Tastiera/mouse virtuale per smart TV e PC: app sul telefono → ESP32-S3 → cavo USB → target.

- **ESP32-S3** collegato al target via USB: si presenta come tastiera/mouse HID composita (keyboard + mouse + media keys)
- **App** (PWA + guscio nativo Capacitor, una sola codebase React/TS) si collega all'ESP via:
  - 🔵 BLE (servizio GATT custom) — nessuna rete necessaria
  - 🏠 WiFi di casa (WebSocket) — telefono ed ESP sulla stessa rete
  - 📡 Hotspot ESP (WebSocket + captive portal) — nessuna rete necessaria

## Struttura

```
app/        Web app React+Vite+TS, wrapper Capacitor iOS/Android
firmware/   Firmware ESP32-S3 (PlatformIO / Arduino)
docs/       protocol.md (fonte di verità) · architecture.md
```

## Documentazione

- [Protocollo di comunicazione](docs/protocol.md)
- [Architettura](docs/architecture.md)
- [Risoluzione problemi firmware (log sessione debug)](docs/troubleshooting.md)

## Stato

📋 Fase di pianificazione completata. Prossimi passi: scaffold firmware + app base (vedi roadmap in `docs/architecture.md`).
