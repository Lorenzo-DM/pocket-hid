# MK-Remote — Piano di lavoro

> File di ripresa: aggiornare a ogni fase completata, committare.
> Ultimo aggiornamento: fasi 3–6 scritte (trackpad, speciali/media, macro, BLE+portal+OTA) + modalità debug/demo; **firmware 0.3.0 da ricompilare e testare** (non compilato in sessione). Fase 1 verificata su hardware (2025-11-23).

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

## Hardware reale (scoperte sessione debug 2025-11-23)

- **Scheda con UN SOLO connettore USB-C** (direct OTG, niente bridge UART): non c'è porta COM → i log seriali non sono visibili, il flash richiede download mode via BOOT.
- **4 MB di flash** (non gli 8 MB di default della board PIO) → `board_upload.flash_size = 4MB` in `platformio.ini`.
- **Lib Adafruit TinyUSB patchata** in `.pio/libdeps`: `CFG_TUD_HID 2→3` (media keys). ⚠️ La patch viene persa con `pio pkg update`.
- **Procedura flash-and-run** (v. `docs/troubleshooting.md` §6 e §9): download mode = power-on con BOOT tenuto; dopo il flash la ROM resta in download mode → serve **unplug/replug del cavo** per avviare l'app (reset esptool via USJ non basta).
- **Init USB TinyUSB corretto** (era il crash principale): `ARDUINO_USB_MODE=0` + `TinyUSBDevice.begin() → usb_hid_begin() → USB.begin()` in `main.cpp`.
- Credenziali WiFi: `firmware/src/config_local.h` (gitignored, v. `config_local.h.example`) — NON committare credenziali.
- Pagina di test standalone: `tools/mk-test.html` (apribile da file://, si connette a `ws://esp32-hid.local/ws`).

## File chiave

- `docs/protocol.md` — protocollo di comunicazione (FONT DI VERITÀ: messaggi, keycode HID, GATT, WS)
- `docs/architecture.md` — architettura, trasporti, sicurezza, roadmap
- `firmware/README.md` — stack firmware, struttura, note hardware
- Firmware: `firmware/src/{main,config.h,usb_hid,keymap,ws_server}` (PlatformIO, env `esp32s3`)
- App: `app/src/protocol/{hid,messages,connection}` + `components/{ConnectView,StatusBar,KeyboardView,TextView}`

## Stato fasi

### ✅ Fase 1 — Firmware base (**VERIFICATA su hardware reale, 2025-11-23**)
- Composite HID TinyUSB (keyboard 6KRO + mouse + consumer), USB-OTG — 3 interfacce HID enumerate
- WS `ws://<ip>/ws`: hello/welcome, token opzionale, comandi key/text/consumer/mouse/mbtn/scroll/state — handshake e comandi testati via script
- `GET /status` risponde, mDNS `esp32-hid.local` raggiungibile, WiFi OK
- Limiti: layout US/ASCII only, text bloccante, un client alla volta, macro stub
- Config: `firmware/src/config.h` + `config_local.h` (gitignored) per le credenziali
- File di sessione debug: `docs/troubleshooting.md` (flash size, init USB, download mode, CDC log)

### ✅ Fase 2 — PWA base (codice scritto, NON testata end-to-end)
- Connessione WS con handshake, riconnessione backoff, heartbeat via `{t:"state"}` (15s)
- Tastiera on-screen: Esc/F1-12, cifre, QWERTY, Invio/Tab/Backspace/Del, frecce, mod sticky one-shot (Ctrl/Alt/Win/Shift), Spazio
- Modalità testo: textarea + invia, warning caratteri non-ASCII
- Build verificata (tsc + vite). Manca manifest PWA (rimandato a fase 8, aggiungibile subito su richiesta)

### ✅ Fase 3 — Trackpad (codice scritto, NON testato end-to-end)
- `app/src/components/TrackpadView.tsx`: pointer events, 1 dito = move relativo, tap breve = click sx, long-press 550ms = click dx, 2 dita = scroll
- Coalescing ~60Hz via rAF; accumulatore con parte frazionaria; **clamp ±120** (firmware usa int8_t, l'eccesso va al frame successivo)
- Pulsanti fisici L/R sotto il pad: pressione prolungata = drag (down/up), non click singolo
- Tab "Trackpad" predefinito in App.tsx; sensitivity 1.6 costante (regolabile dopo feedback)

### ✅ Fase 4 — Speciali estesi + media keys (codice scritto, NON testato end-to-end)
- `hid.ts`: aggiunti PRINTSCREEN/SCROLLLOCK/PAUSE/INSERT/HOME/PAGEUP/END/PAGEDOWN/CAPSLOCK + CONSUMER.STOP/BRIGHTNESS_UP/BRIGHTNESS_DOWN
- `KeyboardView`: riga compatta di 9 tasti speciali sotto i modificatori (font ridotto)
- `MediaView` (nuova tab "Media"): volume ± e luminosità ± con **ripetizione a 350ms tenendo premuto**, mute, prev/play/next, stop, power (stile danger)
- Nota: CapsLock è un tap; lo stato LED del target non è noto all'app (nessun campo nel welcome)

### ✅ Fase 5 — Macro (codice scritto, NON compilato né testato)
**Firmware** (`firmware/src/macro.h/.cpp`, fw 0.2.0):
- Persistenza NVS (Preferences, namespace `mkmac`): blob JSON degli step sotto chiave = id; indice id in chiave `__idx` (la lib non espone enumerazione chiavi)
- Limiti: 12 macro, id `[a-zA-Z0-9_-]` 1–20 char, 64 step, blob ≤ 2 KB, attesa max 60s
- **Player non-bloccante**: `macro_tick()` da `loop()`, micro-fasi (down→8ms→up→8ms, testo char-per-char 6ms, consumer, wait) con deadline su `millis()` — WS e USB restano reattivi
- Tap macro usa report HID diretti (non lo stato 6KRO del ws_server)
- Router WS: `macro_save`/`macro_del` rispondono con uno `state` (lista aggiornata, fa da ack); `macro_run` → `macro_done` broadcast a fine esecuzione; `macro_get` → `macro_data` (contenuto, per edit)
- Protocollo aggiornato: "Formato step macro" in docs/protocol.md (`k`/`s`/`c`/`w`)

**App**:
- `MacroView` (nuova tab "Macro"): lista con ▶/✎/🗑, editor step (Tasto+mods, Testo, Media, Attesa) con riordino e rimozione, salvataggio su ESP
- Modifica macro esistente: scarica il contenuto via `macro_get`→`macro_data` (nuovo messaggio in protocollo)
- `connection.ts`: sottoscrizione `onMessage()` per messaggi dedicati (macro_data/macro_done)
- Mock: simula save/del (aggiorna lista nello state), run (macro_done dopo 800ms), get (step vuoti)

### ✅ Fase 6 — BLE + portal + OTA (codice scritto, NON compilato né testato)
**Refactor**:
- **`commands.cpp/.h`**: routing comandi estratto da `ws_server` (stato 6KRO, handler, costruzione status) — condiviso da WS e BLE (come previsto in "Deposito")

**BLE GATT** (`ble_server.cpp`, NimBLE-Arduino 2.x — richiede core 3.x):
- Servizio `7a0c1000-…`, RX `…1001` (write+writeNR, ENC), TX `…1002` (notify, ENC) → **pairing obbligatorio** via cifratura
- Pairing "Just Works" (bonding+SC, IO none); handshake hello richiesto dopo ogni (ri)connessione, senza token
- Conn interval richiesto 7.5–15ms; MTU 247; JSON multi-write accumulato (buffer 1KB, overflow → errore+reset)
- `ble_server_broadcast()` per `macro_done`; welcome/state riportano `ble` = client connessi

**WiFi/portal** (`wifi_mgr.cpp`):
- Credenziali in NVS (`mkcfg`: ssid/pass), **priorità su quelle compilate** (fallback iniziale)
- AP+STA sempre attivo: SSID `MK-Remote-XXXX`, WPA2 `MK_AP_PASS` (config.h)
- Captive portal: DNS wildcard + probe redirect; pagina config `/` con form → `POST /save` → NVS → auto-reboot
- `GET /wifi-info` diagnostica

**OTA (preparazione)**:
- Partizioni `min_spiffs.csv` (due slot app, NVS invariata a 0x9000)
- `GET /update` form upload + `POST /update` multipart con `Update.h` → flash + reboot (UI definitiva in fase 9)

**platformio.ini**: aggiunto `h2zero/NimBLE-Arduino@^2.2.0` (+ nota per core 2.x → ~1.4.3); partizioni min_spiffs

**App**: nessuna modifica (il client BLE arriva in fase 7); mock e PWA invariati

### ✅ Modalità debug/demo (trasversale, fuori roadmap)
- Interfaccia `DeviceLink` in `connection.ts`: l'app non sa se parla col WS reale o col mock
- `app/src/protocol/mock_connection.ts`: simula handshake (connecting→authing→ready), welcome fittizio, risponde a heartbeat `state`; logga ogni messaggio
- `app/src/protocol/debug.ts`: flag persistito (`localStorage.mk.debug`) + log store condiviso (tx/rx/info, max 100 righe)
- `DebugLog.tsx`: pannello flottante 🐞 con ultimi 14 messaggi (tx blu, rx verde, info ambra)
- Toggle in ConnectView ("🐞 modalità debug (senza ESP)") → ricarica pagina; badge DEMO in status bar
- Attivazione rapida: anche query param futuro `?debug` (ora solo toggle UI)

### 🧪 Test utente da fare (bloccante per fidarsi delle assunzioni)
1. **Modalità debug** (nessun hardware): schermata connessione → "🐞 modalità debug" → "Entra in demo" → tutte le 5 tab usabili, badge DEMO, log messaggi col pulsante 🐞 (provare anche tab Macro: save/run/del simulati)
2. **Ricompilare firmware 0.3.0** (`pio run -e esp32s3`): ⚠️ scaricherà NimBLE-Arduino; ⚠️ cambia partizioni (min_spiffs) → verificare che NVS/credenziali sopravvivano; poi flash porta **UART** (OTG resta per HID) → `GET /status` → `"usb":"mounted"`
3. Test handshake/console: `ws://esp32-hid.local/ws`, hello + `{t:"key",code:0x1E,act:"t"}` = tasto "1"
4. `npm run dev` in `app/` → connessione reale → tastiera e testo funzionanti sul target
5. Tab Trackpad: movimento fluido, tap = click sx, long-press = click dx, 2 dita = scroll, drag coi pulsanti L/R
6. Tab Tastiera: riga speciale (Stamp, Home, PgSu/PgGiu, Caps…) e tab Media (volume con repeat, play, power)
7. Tab Macro: crea una macro (es. testo+invio+attesa+play), salva, esegui sul target, verifica che WS resti reattivo durante l'esecuzione, poi elimina
8. **Captive portal**: connettersi all'AP `MK-Remote-XXXX` (pass in config.h) → apre la config page → salvare credenziali → riavvio → si riconnette alla rete
9. **BLE**: dall'app nRF Connect (o Chrome Web Bluetooth quando ci sarà la fase 7): pairing con `MK-Remote`, hello su RX char → welcome su notify
10. **OTA**: `http://<ip>/update` → caricare un .bin (anche lo stesso) → verifica reboot e firma version

## Roadmap (prossime fasi)

- **Fase 7**: Guscio Capacitor (iOS/Android) + `@capacitor-community/bluetooth-le` + Web Bluetooth nella PWA.
- **Fase 8**: PWA servita dall'ESP32 (LittleFS) + manifest PWA + Service Worker cache offline.
- **Fase 9**: Pagina `/flash` su GitHub Pages (HTTPS richiesto da Web Serial) con **ESP Web Tools** (esptool-js) + pubblicazione binari release + OTA WiFi. Nota: Web Serial ❌ su Safari/iOS; documentare porta UART vs OTG.
- **Deposito**: spostare routing comandi da `ws_server.cpp` a `command_router.cpp` quando arriva il BLE.

## Prossima azione

1. Test utente: ricompila/flasha firmware 0.3.0 (prima di tutto: NimBLE scaricato, partizioni cambiate) e testa Fasi 2–6 end-to-end
2. Se OK → iniziare **Fase 7 (guscio Capacitor + client BLE Web Bluetooth/@capacitor-community/bluetooth-le)**
3. Quando si ricompila con toolchain fresh, ricontrollare `CFG_TUD_HID=3` in `.pio/libdeps/.../tusb_config_esp32.h`
