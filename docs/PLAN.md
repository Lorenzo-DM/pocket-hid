# PocketHID — Piano di lavoro

> File di ripresa: aggiornare a ogni fase completata, committare.
> Ultimo aggiornamento: **tutte le 9 fasi scritte**; da fare: test utente completi + hosting pagina flash. Fase 1 verificata su hardware (2025-11-23).

## Obiettivo

Tastiera/mouse virtuale per smart TV e PC: app sul telefono → ESP32-S3 → cavo USB → target.
L'ESP si presenta al target come tastiera/mouse HID composita; l'app (PWA + guscio nativo) invia i comandi via BLE, WiFi di casa o hotspot ESP.

## Decisioni architetturali (chiusure definitive)

- **Output**: SOLO USB HID via cavo (TinyUSB, composite keyboard+mouse+consumer). Niente BLE HID verso il target.
- **Input**: solo 3 trasporti — 🔵 BLE (GATT custom), 🏠 WebSocket su WiFi di casa (mDNS `pockethid.local`), 📡 WebSocket su hotspot ESP (captive portal). Nessun altro mezzo (IR, NFC, audio ecc. scartati).
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
- Pagina di test standalone: `tools/pockethid-test.html` (apribile da file://, si connette a `ws://pockethid.local/ws`).

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
- `GET /status` risponde, mDNS `pockethid.local` raggiungibile, WiFi OK
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
- AP on-demand (modifica post-test): attivo all'avvio e come fallback; si spegne quando lo STA prende IP, riattivato ~15 s dopo una disconnessione persistente. SSID `PocketHID-XXXX`, WPA2 `MK_AP_PASS` (config.h)
- Con la PWA montata su LittleFS il portal di config passa a `/portal` (la radice `/` è della PWA); senza PWA il portal resta su `/`
- Captive portal: DNS wildcard + probe redirect; pagina config `/` con form → `POST /save` → NVS → auto-reboot
- `GET /wifi-info` diagnostica

**OTA (preparazione)**:
- Partizioni `min_spiffs.csv` (due slot app, NVS invariata a 0x9000)
- `GET /update` form upload + `POST /update` multipart con `Update.h` → flash + reboot (UI definitiva in fase 9)

**platformio.ini**: aggiunto `h2zero/NimBLE-Arduino@^2.2.0` (+ nota per core 2.x → ~1.4.3); partizioni min_spiffs

**App**: nessuna modifica (il client BLE arriva in fase 7); mock e PWA invariati

### ✅ Fase 7a — Client BLE Web Bluetooth in PWA (codice scritto, NON testato)
- `protocol/ble_connection.ts`: `BleConnection` implements `DeviceLink` — stesso handshake/heartbeat/backoff del WS; UUID combaciano con `ble_server.cpp`
- `requestDevice` filtrato per service UUID (fingerprint); riconnessione al device già scelto senza nuovo gesto utente (max 5 tentativi con backoff, poi errore)
- mouse/scroll → `writeWithoutResponse` (fire-and-forget) se ci sta in un pacchetto (≤244B), resto → long write con risposta; il firmware accumula i JSON multi-write
- `types/web-bluetooth.d.ts`: tipi minimi scritti a mano, **zero dipendenze installate**
- ConnectView: selettore trasporto a tab (**🏠 WiFi / 🔵 Bluetooth / 🐞 Demo**), persistito in `mk.transport` (+ chiave `mk.debug`); StatusBar mostra il trasporto attivo
- Il pairing BLE è confermato dall'OS (il browser mostra la finestra di selezione; l'accoppiamento va confermato)

### ✅ Fase 7b — Guscio Capacitor Android (installazioni approvate dall'utente; NON compilato)
- Dipendenze installate (consenso 2025-11-23): `@capacitor/core @capacitor/cli @capacitor/android @capacitor-community/bluetooth-le` (Capacitor 8.6, plugin 8.4) — iOS **non** aggiunto (richiesta esplicita: solo Android)
- `cap init`: appId `io.pockethid.app`, webDir `dist`; cartella `android/` generata e committata
- Permessi BLE in `android/app/src/main/AndroidManifest.xml` (BLUETOOTH_SCAN neverForLocation + CONNECT); config `plugins.BluetoothLe`
- **Refactor BLE client**: `ble_base.ts` (macchina a stati comune: hello/heartbeat/backoff) + `ble_web.ts` (Web Bluetooth) + `ble_native.ts` (BleClient plugin, chunk 244B, CONNECTION_PRIORITY_HIGH per il mouse) — scelta automatica via `Capacitor.isNativePlatform()`
- Script npm: `cap:sync`, `cap:android` (Android Studio), `cap:run-android`
- Plugin nota: MTU auto-negoziato lato plugin; conn priority richiesta esplicitamente

### ✅ Fase 8 — PWA servita dall'ESP32 (codice scritto, NON testato)
- **Firmware**: mount LittleFS + `serveStatic("/", LittleFS, "/").setDefaultFile("index.html")` (dopo le route API); `board_build.filesystem = littlefs` in platformio.ini — i file si caricano con **`pio run -t uploadfs`**
- **manifest.webmanifest**: standalone, tema scuro, icona SVG (`icon.svg` — Chrome accetta SVG sizes:any); meta apple-touch per iOS
- **`public/sw.js`** scritto a mano (zero plugin): navigazioni network-first (fallback cache `/index.html`), asset stale-while-revalidate; registrato solo in build PROD → **l'app parte anche offline**
- **ConnectView**: se la pagina viene servita dall'ESP (http + host non-localhost), il default WS diventa `ws://<host>/ws` automaticamente; warning se si sceglie BLE senza secure context (Web Bluetooth richiede HTTPS)
- Limiti: da pagina http dell'ESP il tab BLE è disabilitato dal browser (https o app Android per il BLE); OTA mentre la PWA gira dall'ESP: la pagina /update serve comunque (route API prima di serveStatic)

### ✅ Fase 9 — Pagina /flash + OTA (codice scritto, pubblicazione da fare)
- `tools/flash/index.html`: pagina statica con **ESP Web Tools** (esptool-js via CDN unpkg, zero build) — installazione firmware da Chrome/Edge su HTTPS; nota compat: **Web Serial ❌ Safari/iOS** (per quelli: OTA `/update` o PC con Chrome); procedura download-mode per board single-USB + replug post-flash
- `tools/flash/manifest.json`: parti flash con offset S3 (bootloader@0x0, partitions@0x8000, boot_app0@0xe000, app@0x10000); **rigenerato dallo script** con la versione
- `tools/make-flash-release.sh`: copia i binari dalla build PlatformIO (+ boot_app0 dal core Arduino) e scrive il manifest con la versione di config.h; i bin sono gitignored (rigenerabili)
- `tools/flash/README.md`: hosting della pagina (GitHub Pages / hosting statico HTTPS) + OTA WiFi documentata
- README.md root aggiornato (struttura, installazione, stato)

### ✅ Modalità debug/demo (trasversale, fuori roadmap)
- Interfaccia `DeviceLink` in `connection.ts`: l'app non sa se parla col WS reale o col mock
- `app/src/protocol/mock_connection.ts`: simula handshake (connecting→authing→ready), welcome fittizio, risponde a heartbeat `state`; logga ogni messaggio
- `app/src/protocol/debug.ts`: flag persistito (`localStorage.mk.debug`) + log store condiviso (tx/rx/info, max 100 righe)
- `DebugLog.tsx`: pannello flottante 🐞 con ultimi 14 messaggi (tx blu, rx verde, info ambra)
- Toggle in ConnectView ("🐞 modalità debug (senza ESP)") → ricarica pagina; badge DEMO in status bar
- Attivazione rapida: anche query param futuro `?debug` (ora solo toggle UI)

### 🧪 Test utente da fare (bloccante per fidarsi delle assunzioni)
1. **Modalità debug** (nessun hardware): schermata connessione → tab "🐞 Demo" → "Entra in demo" → tutte le 5 tab usabili, badge DEMO, log messaggi col pulsante 🐞 (provare anche tab Macro: save/run/del simulati)
2. **Ricompilare firmware 0.3.0** (`pio run -e esp32s3`): ⚠️ scaricherà NimBLE-Arduino; ⚠️ cambia partizioni (min_spiffs) → verificare che NVS/credenziali sopravvivano; poi flash porta **UART** (OTG resta per HID) → `GET /status` → `"usb":"mounted"`
3. Test handshake/console: `ws://pockethid.local/ws`, hello + `{t:"key",code:0x1E,act:"t"}` = tasto "1"
4. `npm run dev` in `app/` → connessione reale → tastiera e testo funzionanti sul target
5. Tab Trackpad: movimento fluido, tap = click sx, long-press = click dx, 2 dita = scroll, drag coi pulsanti L/R
6. Tab Tastiera: riga speciale (Stamp, Home, PgSu/PgGiu, Caps…) e tab Media (volume con repeat, play, power)
7. Tab Macro: crea una macro (es. testo+invio+attesa+play), salva, esegui sul target, verifica che WS resti reattivo durante l'esecuzione, poi elimina
8. **Captive portal**: connettersi all'AP `PocketHID-XXXX` (pass in config.h) → apre la config page → salvare credenziali → riavvio → si riconnette alla rete
9. **BLE da PWA** (fase 7a): Chrome/Edge → tab "🔵 Bluetooth" → "Seleziona dispositivo" → pairing `PocketHID` → tutte le funzioni (tastiera/trackpad/macro) via BLE; verificare anche riconnessione e `writeWithoutResponse` per il mouse
10. **BLE da nRF Connect**: pairing con `PocketHID`, hello su RX char → welcome su notify
11. **OTA**: `http://<ip>/update` → caricare un .bin (anche lo stesso) → verifica reboot e firma version
12. **App Android** (fase 7b): `cd app && npm run cap:android` → build in Android Studio → installare sul telefono → tab Bluetooth → pairing → funzioni via plugin
13. **PWA dall'ESP** (fase 8): dopo `pio run -t uploadfs` → aprire `http://pockethid.local/` (o IP) → app completa installabile (icona, offline dopo primo load); verifica default WS e warning BLE senza https
14. **Pagina /flash** (fase 9): `pio run -e esp32s3` + `tools/make-flash-release.sh` → pubblicare su host statico HTTPS (v. `tools/flash/README.md`) → installazione firmware da Chrome con ESP Web Tools
12. **App Android** (fase 7b): `cd app && npm run cap:android` → build in Android Studio → installare sul telefono → tab Bluetooth → pairing → funzioni via plugin

## Roadmap (prossime fasi)

- **Fase 7b+ iOS**: aggiungere `@capacitor/ios` quando l'utente lo chiede (Xcode necessario).
- **Deposito chiuso**: il routing comandi è già estratto in `commands.cpp` (fase 6), condiviso WS/BLE.

## Roadmap post-v1 (eventuali)
- Release binari firmate e tag (workflow CI opzionale)
- Layout IT + unicode a run-length per `text` (v. limiti fase 1)
- Client multipli simultanei (oggi un client authed per trasporto)
- Test unitari dell'app (Vitest) e del keymap

## Prossima azione

1. Test utente completi (lista qui sopra: firmware, portal, BLE, Android, PWA, pagina flash)
2. Pubblicare la pagina flash su un host statico HTTPS (v. `tools/flash/README.md`)
3. Quando si ricompila con toolchain fresh, ricontrollare `CFG_TUD_HID=3` in `.pio/libdeps/.../tusb_config_esp32.h`
