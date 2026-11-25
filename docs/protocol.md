# PocketHID Protocol

Shared protocol between the app (PWA / native) and the ESP32-S3 firmware. Identical across all transports (WebSocket and BLE GATT).

## Principles

- **JSON** payload on all transports. Over BLE GATT, compact JSON with short keys is chunked when exceeding `MTU - 3`.
- **Transport-agnostic**: the ESP32 command router handles WebSocket and BLE messages identically.
- Keycodes use **USB HID Usage IDs** (page `0x07` Keyboard, page `0x0C` Consumer). The app sends *key positions*, not characters (except `text` messages).

## 1. Handshake

```json
App -> { "t": "hello", "v": 1, "caps": ["text", "macro"], "token": "..." }
ESP -> { "t": "welcome", "v": 1, "fw": "0.3.0", "layout": "it",
         "usb": "mounted", "ble": 1, "macros": ["id1", "id2"] }
```

- `v`: protocol version. If mismatched, the app stops and warns the user.
- `token`: required on WebSocket when `MK_TOKEN` is configured. Over BLE, encrypted pairing acts as authentication.
- `layout`: `"it"` or `"us"` — active firmware keymap layout.

## 2. Messages: App -> ESP

| `t` (type) | Fields | Notes |
|---|---|---|
| `key` | `code`, `mods`, `act` | `act`: `d`=down, `u`=up, `t`=tap (`code=0` with `mods!=0` = modifier-only tap, e.g. Win/Super key) |
| `text` | `s`, `[i, n]` | UTF-8 string to type using the active firmware layout (`it`/`us`); `i`/`n` = optional chunk index/total |
| `layout` | `layout` | switch firmware keymap layout (`"it"` or `"us"`); responds with `state` |
| `consumer` | `code` | media/consumer key (HID page `0x0C`) |
| `mouse` | `dx`, `dy` | relative movement (`int16`, clamped to `int8` per HID report) |
| `mbtn` | `b`, `act` | `b`: `0`=left, `1`=right, `2`=middle; `act`: `d`/`u`/`c` |
| `scroll` | `dx`, `dy` | two-finger scroll delta |
| `state` | — | requests current diagnostics/status (`welcome`-style payload) |
| `macro_run` | `id` | runs a macro stored in ESP32 NVS; broadcasts `macro_done` on completion |
| `macro_save` | `id`, `steps` | saves/updates a macro in NVS; responds with `state` (updated list) |
| `macro_del` | `id` | deletes a macro from NVS; responds with `state` |
| `macro_get` | `id` | fetches a macro's steps; responds with `macro_data` |

### Macro Step Format

`steps` is an array of objects, each containing **one** of the following keys:

| Step | Fields | Meaning |
|---|---|---|
| Key | `k`, `[m]` | tap HID page `0x07` keycode with optional modifier bitmask `m` |
| Text | `s` | UTF-8 string typed using the active firmware layout |
| Media | `c` | HID page `0x0C` consumer code |
| Wait | `w` | delay in milliseconds (max `60000`) |

Example:

```json
{
  "t": "macro_save",
  "id": "netflix",
  "steps": [
    { "s": "netflix.com" },
    { "k": 40 },
    { "w": 2000 },
    { "c": 205 }
  ]
}
```

Firmware limits: `id` matching `[a-zA-Z0-9_-]` (1–20 chars, excluding `"__idx"`), max 12 macros, 1–64 steps, JSON blob <= 2 KB.
When playback finishes, the ESP broadcasts `{"t":"macro_done","id":"..."}`.

### Modifier Bitmask (`mods`)

| Bit | Value | Key |
|---|---|---|
| 0 | 1 | Left Ctrl |
| 1 | 2 | Left Shift |
| 2 | 4 | Left Alt |
| 3 | 8 | Left GUI (Win/Cmd) |
| 6 | 64 | Right Alt (AltGr) |

Example `Ctrl+Shift+Esc`: `{"t":"key","code":41,"mods":3,"act":"t"}`.

## 3. Messages: ESP -> App

| `t` (type) | Fields | Notes |
|---|---|---|
| `usb_state` | `st` | `mounted` / `unmounted` — indicates whether the target USB host enumerated the device |
| `ble_state` | `n` | number of connected BLE centrals |
| `macro_done` | `id` | macro execution completed |
| `macro_data` | `id`, `steps` | macro contents (response to `macro_get`) |
| `error` | `msg` | human-readable error message for the UI |

## 4. Reference HID Usage IDs

### Keyboard (Page `0x07`)

| Key | Hex | Key | Hex |
|---|---|---|---|
| A–Z | `0x04`–`0x1D` | 1–9, 0 | `0x1E`–`0x27` |
| Enter | `0x28` | Esc | `0x29` |
| Backspace | `0x2A` | Tab | `0x2B` |
| Space | `0x2C` | `- _` | `0x2D` |
| `= +` | `0x2E` | `[ {` | `0x2F` |
| `] }` | `0x30` | `\ \|` | `0x31` |
| `; :` | `0x33` | `' "` | `0x34` |
| `` ` ~ `` | `0x35` | `, <` | `0x36` |
| `. >` | `0x37` | `/ ?` | `0x38` |
| Caps Lock | `0x39` | F1–F12 | `0x3A`–`0x45` |
| PrintScreen | `0x46` | ScrollLock | `0x47` |
| Pause | `0x48` | Insert | `0x49` |
| Home | `0x4A` | PageUp | `0x4B` |
| Delete | `0x4C` | End | `0x4D` |
| PageDown | `0x4E` | Right | `0x4F` |
| Left | `0x50` | Down | `0x51` |
| Up | `0x52` | Keypad 0–9 | `0x54`–`0x63` |

### Consumer / Media (Page `0x0C`)

| Key | Hex |
|---|---|
| Power | `0x30` |
| Volume Up / Down | `0xE9` / `0xEA` |
| Mute | `0xE2` |
| Play / Pause | `0xCD` |
| Stop | `0xB7` |
| Next / Previous Track | `0xB5` / `0xB6` |
| Brightness Up / Down | `0x6F` / `0x70` |

> **Note on Fn keys**: `Fn` cannot be sent over USB HID because it is handled internally by physical keyboard matrices and never reaches the OS. "Fn+" actions are sent directly as their resulting keycodes (e.g., media or brightness keys).

## 5. BLE GATT Transport

- **Service UUID** (`MK_BLE_SVC`): `7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f`
- **RX Characteristic** (app -> ESP): `7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f` — `WRITE` and `WRITE_NR` (used for fire-and-forget `mouse`/`scroll`), **encryption required** (`WRITE_ENC`).
- **TX Characteristic** (ESP -> app): `7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f` — `NOTIFY`.
- **Device name**: `PocketHID`; the app filters scans by service UUID.
- **MTU & Chunking**: requests MTU 247. For JSON payloads larger than `MTU - 3`:
  - **RX (app -> ESP)**: the app splits the JSON across sequential writes and the ESP accumulates chunks until JSON parsing succeeds (2560 B buffer; overflow returns an error and resets).
  - **TX (ESP -> app)**: large responses (such as `macro_data`) are split across sequential notifications and reassembled in `BleBase` (4 KB buffer, 1.5 s timeout).
- **Connection interval**: requests 7.5–15 ms for smooth trackpad movement.
- **Security**: mandatory pairing/bonding (`WRITE_ENC` + runtime `isEncrypted()` check). Each (re)connection still requires a `hello` handshake (no token needed over BLE).

## 6. Network Transports (WebSocket, Portal & OTA)

### WebSocket

- Endpoint: `ws://<ip>:80/ws`
- **Auth**: per-client; the ESP expects `hello` (`v: 1`) + valid `token` within 5 s, otherwise it closes the socket.
- **Heartbeat**: `{ "t": "state" }` every ~15 s from the app; reconnect with exponential backoff.
- **Discovery**: mDNS `pockethid.local` on the home network.

### On-Demand Hotspot AP & Captive Portal

- AP `PocketHID-XXXX` (last two MAC bytes, WPA2 with `MK_AP_PASS`) runs on demand: enabled at boot, when credentials are missing/invalid, or after 15 s of STA disconnection; turns off once STA obtains an IP.
- Captive portal config page: `/portal` when LittleFS contains the PWA (`index.html`), or `/` otherwise.
- `POST /save` (`ssid`, `pass` form-urlencoded; requires `token` via form field, `?token=` query, or `X-MK-Token` header if `MK_TOKEN` is enabled) -> saves to NVS -> reboots.
- `GET /wifi-info` -> `{ sta_ssid, sta_connected, ip, ap_ssid }`.
- Captive portal probes (`/generate_204`, `/hotspot-detect.html`, `/connecttest.txt`, `/ncsi.txt`, `/fwlink`) redirect to the portal.
- NVS credentials take priority over compiled defaults in `config_local.h`.

### WiFi OTA

- `GET /update` -> upload form; `POST /update` (multipart field `bin`; protected by `MK_TOKEN` via form field `token`, `?token=`, or `X-MK-Token` if configured) -> flashes and performs a deferred reboot on `loopTask`.
- Custom partition table `partitions_4mb.csv`: two 1.75 MB OTA slots + 384 KB LittleFS for the PWA.

## 7. Cross-Cutting Conventions

- **Mouse coalescing**: the app emits `mouse` events at ~60 Hz; the firmware accumulates deltas per loop tick and clamps each HID report to `int8` (`-127..127`).
- **Macros**: stored locally in the app (`localStorage`) with JSON import/export, and optionally synced to ESP32 NVS (`macro_save`/`macro_del`).
- **Text input**: `text` handles uppercase, accents, and symbols according to the active `layout` (`it` or `us`).
