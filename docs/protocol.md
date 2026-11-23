# MK-Remote Protocol

Lingua franca tra l'app (web/nativa) e l'ESP32. Identica su tutti i trasporti (WebSocket, BLE GATT).

## Principi

- **JSON** come formato su entrambi i trasporti. Su GATT: JSON compatto (chiavi corte), chunking per messaggi > MTU.
- **Un solo schema**: l'ESP32 non distingue da quale trasporto arriva il messaggio.
- I keycode sono **HID Usage ID** (pagina 0x07 tastiera, pagina 0x0C consumer). L'app manda *posizioni di tasto*, mai caratteri.

## 1. Handshake

```
App  ->  { "t": "hello", "v": 1, "caps": ["text","macro"], "token": "..." }
ESP  ->  { "t": "welcome", "v": 1, "fw": "0.1.0", "layout": "it",
           "usb": "mounted", "ble": 1, "macros": ["id1","id2"] }
```

- `v`: versione protocollo. Se non combacia, l'app avvisa l'utente e si ferma.
- `token`: richiesto su WebSocket (WiFi casa / hotspot). Su BLE il pairing fa da auth.
- `layout`: `"it"` o `"us"` — deve combaciare col layout selezionato nell'app.

## 2. Messaggi App → ESP

| t (type) | Campi | Note |
|---|---|---|
| `key` | `code`, `mods`, `act` | `act`: `d`=down, `u`=up, `t`=tap |
| `text` | `s`, [`i`, `n`] | stringa da digitare; `i`/`n` = chunk indice/totale (BLE) |
| `consumer` | `code` | media keys (pagina 0x0C) |
| `mouse` | `dx`, `dy` | movimento relativo, int16 |
| `mbtn` | `b`, `act` | `b`: 0=left 1=right 2=middle; `act`: `d`/`u`/`c` |
| `scroll` | `dx`, `dy` | due dita sul trackpad |
| `macro_run` | `id` | esegue una macro salvata nell'ESP (NVS); risposta `macro_done` a fine esecuzione |
| `macro_save` | `id`, `steps` | salva/aggiorna macro; a successo risponde con uno `state` (lista aggiornata) |
| `macro_del` | `id` | elimina macro; a successo risponde con uno `state` |
| `macro_get` | `id` | richiede il contenuto; risposta `macro_data` |

#### Formato step macro

`steps` è un array di oggetti, ciascuno con UNA delle chiavi seguenti:

| Step | Campi | Significato |
|---|---|---|
| Tasto | `k`, [`m`] | tap del keycode HID 0x07 con modificatori (stesso bitmask di `key`) |
| Testo | `s` | stringa digitata (limiti del firmware: ASCII, layout corrente) |
| Media | `c` | codice consumer 0x0C |
| Attesa | `w` | pausa in ms (max 60000) |

Esempio:
```json
{ "t": "macro_save", "id": "netflix",
  "steps": [ {"s":"netflix.com"}, {"k":0x28}, {"w":2000}, {"c":0xcd} ] }
```

Limiti firmware: id `[a-zA-Z0-9_-]` 1–20 char, max 12 macro, max 64 step, blob ≤ 2 KB.
Al termine dell'esecuzione l'ESP invia `{"t":"macro_done","id":"..."}`.
| `state` | — | richiede diagnostica |

### Bitmask modificatori (`mods`)

| Bit | Valore | Tasto |
|---|---|---|
| 0 | 1 | Ctrl |
| 1 | 2 | Shift |
| 2 | 4 | Alt |
| 3 | 8 | Gui (Win/Cmd) |

Esempio Ctrl+Shift+Esc → `{"t":"key","code":41,"mods":3,"act":"t"}`

## 3. Messaggi ESP → App

| t (type) | Campi | Note |
|---|---|---|
| `usb_state` | `st` | `mounted` / `unmounted` — l'ESP sa se il target lo vede |
| `ble_state` | `n` | numero central connesse |
| `macro_done` | `id` | conferma esecuzione macro |
| `macro_data` | `id`, `steps` | contenuto di una macro (risposta a `macro_get`) |
| `error` | `msg` | messaggio leggibile per la UI |

## 4. Keycode di riferimento (HID Usage ID)

### Tastiera (page 0x07)

| Tasto | Hex | Tasto | Hex |
|---|---|---|---|
| A–Z | 0x04–0x1D | 1–9,0 | 0x1E–0x27 |
| Enter | 0x28 | Esc | 0x29 |
| Backspace | 0x2A | Tab | 0x2B |
| Space | 0x2C | - _ | 0x2D |
| = + | 0x2E | [ { | 0x2F |
| ] } | 0x30 | \ \| | 0x31 |
| ; : | 0x33 | ' " | 0x34 |
| ` ~ | 0x35 | , < | 0x36 |
| . > | 0x37 | / ? | 0x38 |
| Caps Lock | 0x39 | F1–F12 | 0x3A–0x45 |
| PrintScreen | 0x46 | ScrollLock | 0x47 |
| Pause | 0x48 | Insert | 0x49 |
| Home | 0x4A | PageUp | 0x4B |
| Delete | 0x4C | End | 0x4D |
| PageDown | 0x4E | Right | 0x4F |
| Left | 0x50 | Down | 0x51 |
| Up | 0x52 | Keypad 0–9 | 0x54–0x63 |

### Consumer / media (page 0x0C)

| Tasto | Hex |
|---|---|
| Power | 0x30 |
| Volume Up / Down | 0xE9 / 0xEA |
| Mute | 0xE2 |
| Play/Pause | 0xCD |
| Stop | 0xB7 |
| Next / Prev track | 0xB5 / 0xB6 |
| Brightness Up / Down | 0x6F / 0x70 |

> **Nota Fn**: non è inviabile — è gestito dalla matrice della tastiera fisica, mai visibile all'OS. Le funzioni "Fn+" si ottengono mandando il loro risultato (es. media keys, luminosità).

## 5. Trasporto BLE GATT

- **Servizio**: UUID 128-bit custom (fingerprint per lo scan dell'app)
- **RX char** (app → ESP): write. Senza risposta per `mouse` (fire-and-forget), con risposta per il resto
- **TX char** (ESP → app): notify
- **MTU**: negoziare il massimo; chunking con `i`/`n` oltre il limite
- **Connection interval**: richiesto 7.5–15ms per mouse fluido
- **Sicurezza**: pairing/bonding obbligatorio prima di accettare write

## 6. Trasporto WebSocket

- Endpoint: `ws://<ip>:<porta>`
- **Auth**: l'ESP attende `hello`+token valido entro timeout, altrimenti chiude
- **Heartbeat**: ping/pong ogni ~5s; riconnessione app con backoff esponenziale
- **Scoperta**: mDNS `esp32-hid.local` su rete di casa; IP fisso / captive portal sull'hotspot ESP

## 7. Convenzioni trasversali

- **Coalescing mouse**: l'app genera `mouse` a ~60Hz; su BLE può batchare tra un interval e l'altro. Il firmware somma i delta.
- **Macro**: salvate nell'ESP (NVS), elenco nel `welcome`; editor nell'app, sync via `macro_save`/`macro_del`.
- **Modi di invio testo**: `text` gestisce maiuscole, accenti e caratteri speciali secondo `layout` (IT/US).
