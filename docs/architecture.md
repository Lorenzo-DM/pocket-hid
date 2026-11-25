# PocketHID — Architecture

Tastiera/mouse virtuale: app su telefono → ESP32-S3 → dispositivo target.

## Flusso

```
Telefono (PWA / app Capacitor)
   │
   ├── 🔵 BLE (servizio GATT custom)     ← uso senza rete, unico modo su iOS
   ├── 🏠 WebSocket su WiFi di casa      ← stesso network, scoperta mDNS
   └── 📡 WebSocket su hotspot ESP       ← captive portal, telefono offline
         │
         ▼
      ESP32-S3 ────── cavo USB ──────▶ TV / PC / tablet
      (composite HID:                  (vede una tastiera/mouse USB
       keyboard + mouse                reale)
       + consumer keys)
```

- **Output**: solo USB HID (TinyUSB). Nessun BLE HID verso il target — niente pairing col target.
- **Input**: solo BLE GATT custom + WebSocket. Nessun altro mezzo.
- Tutto il mapping testo→keycode, macro e modifier vive **nell'ESP32**: i canali sono pipe.

## Componenti

### 1. `/app` — Web app (React + Vite + TS) con Capacitor

- **PWA** nel browser: WebSocket (WiFi) + Web Bluetooth (Chrome/Edge desktop e Android)
- **App nativa iOS/Android**: stesso identico codice in una WebView Capacitor, BLE via `@capacitor-community/bluetooth-le`
- `Capacitor.isNativePlatform()` decide il layer di trasporto a runtime
- Sezioni: Trackpad/Mouse · Tastiera (tutti i speciali tranne Fn, non inviabile) · Media keys · Modalità testo · Macro · Settings
- Connection picker unico con auto-discovery (BLE advertising + mDNS + captive portal), riconnessione automatica all'ultima via usata
- La PWA viene servita anche direttamente dall'ESP32 (file statici + mDNS), con cache offline via Service Worker

### 2. `/firmware` — ESP32-S3 (PlatformIO / Arduino)

- **TinyUSB**: composite HID device (keyboard + mouse + consumer control)
- **NimBLE**: servizio GATT custom (RX/TX chars), pairing obbligatorio
- **ESPAsyncWebServer**: WebSocket + file statici della PWA + captive portal (DNS redirect)
- **Modalità STA + AP on-demand**: connesso alla rete di casa l'hotspot è spento; l'AP si attiva all'avvio, con credenziali mancanti/errate o se lo STA cade (dopo ~15 s di tentativi)
- Logica: parser comandi, mapping keycode→report HID, layout IT/US, macro in NVS, diagnostica (stato USB/BLE/WiFi)

### 3. `/docs` — Riferimenti

- `protocol.md`: protocollo di comunicazione (fonte di verità)
- `architecture.md`: questo documento

## Trasporti a confronto

| | 🔵 BLE | 🏠 WiFi casa | 📡 Hotspot ESP |
|---|---|---|---|
| Setup | pairing una volta | zero config | connettersi all'hotspot |
| Internet sul telefono | ✅ | ✅ | ❌ |
| Raggio | ~10m | rete casa | ~20-30m |
| Scoperta | scan per UUID servizio | mDNS | captive portal / IP fisso |

## Sicurezza

- BLE: pairing/bonding (crittografia a livello GAP)
- WiFi/AP: token generato dall'ESP, inserito una volta nell'app; WPA2 con password sull'hotspot
- Un mouse/tastiera remota controlla il target: nessun endpoint anonimo

## Limitazioni note

- Target in standby profondo: molti TV non reagiscono a input USB spenti → accendere col telecomando originale (eventuale IR blaster = fase 2, fuori scope)
- Modalità hotspot: il telefono perde internet (documentarlo nella UI)
- WiFi casa richiede telefono ed ESP sulla stessa rete
- Porte USB di alcune TV forniscono poca corrente: il firmware gestisce brownout, opzione alimentazione esterna

## Roadmap

1. Firmware: WS server + TinyUSB HID (keyboard+mouse+consumer)
2. PWA base: connessione + tastiera + modalità testo
3. Trackpad touch + scroll
4. Speciali estesi + media keys
5. Macro (editor UI + runtime su firmware, persistenza NVS)
6. BLE GATT (PWA su Chrome/Android) + modal spesso hotspot/captive portal
7. Guscio Capacitor iOS/Android + plugin BLE
8. App servita dall'ESP32 + cache offline
