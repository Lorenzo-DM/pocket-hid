# MK-Remote — Piano di lavoro

> File di ripresa: aggiornare a ogni fase completata, committare.
> Ultimo aggiornamento: fasi 1–2 completate (codice, test hardware a carico dell'utente).

## Obiettivo

Tastiera/mouse virtuale per smart TV e PC: app sul telefono → ESP32-S3 → cavo USB → target.
L'ESP si presenta al target come tastiera/mouse HID composita; l'app (PWA + guscio nativo) invia i comandi via BLE, WiFi di casa o hotspot ESP.

## Decisioni architetturali (chiusure definitive)

- **Output**: SOLO USB HID via cavo (TinyUSB, composite keyboard+mouse+consumer). Niente BLE HID verso il target.
- **Input**: solo 3 trasporti — 🔵 BLE (GATT custom), 🏠 WebSocket su WiFi di casa (mDNS `esp32-hid.local`), 📡 WebSocket su hotspot ESP (captive portal). Nessun altro mezzo (IR, NFC, audio ecc. scartati).
- **Codebase app**: una sola — React+Vite+TS (PWA) con **Capacitor** come guscio nativo iOS/Android. Non Expo.
- **BLE su iOS**: unico motivo d'esistere del guscio nativo (Web Bluetooth assente su Safari). Su Chrome/Edge desktop+Android la PWA userà Web Bluetooth.
- **Logica centralizzata nell'ESP32**: mapping testo→keycode, macro, modifier. I canali sono pipe; protocollo identico su tutti i trasporti.
- **Sicurezza**: token WS opzionale (config), pairing BLE obbligatorio, hotspot WPA2.
- **Tasti Fn non inviabili** (gestiti dalla matrice della tastiera fisica) — documentato.
- **Test**: l'utente compila/flashta/testa. **Non installare MAI software senza suo consenso.**
- Limiti noti: target in standby non svegliabile via USB; in hotspot il telefono perde internet; porte USB TV con poca corrente → brownout.

## File chiave

- `docs/protocol.md` — protocollo di comunicazione (FONT DI VERITÀ: messaggi, keycode HID, GATT, WS)
- `docs/architecture.md` — architettura, trasporti, sicurezza, roadmap
- `firmware/README.md` — stack firmware, struttura, note hardware
- Firmware: `firmware/src/{main,config.h,usb_hid,keymap,ws_server}` (PlatformIO, env `esp32s3`)
- App: `app/src/protocol/{hid,messages,connection}` + `components/{ConnectView,StatusBar,KeyboardView,TextView}`

## Stato fasi

### ✅ Fase 1 — Firmware base (codice scritto, NON testato su hardware)
- Composite HID TinyUSB (keyboard 6KRO + mouse + consumer), USB-OTG
- WS `ws://<ip>/ws`: hello/welcome, token opzionale, comandi key/text/consumer/mouse/mbtn/scroll/state
- `GET /status`, mDNS, riconnessione WiFi, release tasti su disconnect
- Limiti: layout US/ASCII only, text bloccante, un client alla volta, macro stub
- Config: `firmware/src/config.h` (WiFi SSID/pass, token)
- Richiede: PlatformIO (installazione a carico utente)

### ✅ Fase 2 — PWA base (codice scritto, NON testata end-to-end)
- Connessione WS con handshake, riconnessione backoff, heartbeat via `{t:"state"}` (15s)
- Tastiera on-screen: Esc/F1-12, cifre, QWERTY, Invio/Tab/Backspace/Del, frecce, mod sticky one-shot (Ctrl/Alt/Win/Shift), Spazio
- Modalità testo: textarea + invia, warning caratteri non-ASCII
- Build verificata (tsc + vite). Manca manifest PWA (rimandato a fase 8, aggiungibile subito su richiesta)

### 🧪 Test utente da fare (bloccante per fidarsi delle assunzioni)
1. PlatformIO → flash porta **UART** (OTG resta per HID) → `GET /status` → `"usb":"mounted"` sul target
2. Test handshake/console: `ws://esp32-hid.local/ws`, hello + `{t:"key",code:0x1E,act:"t"}` = tasto "1"
3. `npm run dev` in `app/` → connessione reale → tastiera e testo funzionanti sul target

## Roadmap (prossime fasi)

- **Fase 3**: Trackpad touch (move relativo ~60Hz, tap=click sx, 2 dita=scroll, long-press/zona=click dx). Coalescing mouse, valutare throttling.
- **Fase 4**: Speciali estesi (Home/End/PgUp/PgDn/CapsLock/Stamp...) + UI media keys (volume/mute/play, page 0x0C).
- **Fase 5**: Macro — editor UI, runtime sul firmware, persistenza NVS, elenco nel welcome, `macro_save/del/run`.
- **Fase 6**: BLE GATT custom (NimBLE: RX/TX chars, pairing, interval 7.5–15ms, chunking MTU) + hotspot AP+STA con captive portal → **espansa**: anche config portal per WiFi in NVS (sostituisce credenziali compilate) + preparazione OTA.
- **Fase 7**: Guscio Capacitor (iOS/Android) + `@capacitor-community/bluetooth-le` + Web Bluetooth nella PWA.
- **Fase 8**: PWA servita dall'ESP32 (LittleFS) + manifest PWA + Service Worker cache offline.
- **Fase 9**: Pagina `/flash` su GitHub Pages (HTTPS richiesto da Web Serial) con **ESP Web Tools** (esptool-js) + pubblicazione binari release + OTA WiFi. Nota: Web Serial ❌ su Safari/iOS; documentare porta UART vs OTG.
- **Deposito**: spostare routing comandi da `ws_server.cpp` a `command_router.cpp` quando arriva il BLE.

## Prossima azione

Fare i test utente (fasi 1–2); se OK → spuntare nei doc → iniziare **Fase 3 (trackpad)**.
