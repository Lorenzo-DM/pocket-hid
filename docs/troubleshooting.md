# Risoluzione problemi — sessione di debug firmware (log 2025-11-23)

Registro di tutti i problemi incontrati portando il firmware ESP32-S3
alla prima build funzionante, con cause, soluzioni e comandi utili.
La scheda in uso ha **un solo connettore USB-C (direct OTG, senza bridge
UART)** — molti problemi ruotano attorno a questa limitazione.

---

## 1. Installazione PlatformIO

### 1.1 `pip install platformio` su sistema con pip "externally managed"
- **Sintomo**: Debian/Ubuntu con Python 3.12 blocca l'installazione globale di pip.
- **Soluzione**: `pip3 install --user --break-system-packages platformio`
  (binario in `~/.local/bin/pio`, già nel PATH).
- **Alternativa pulita**: `pipx install platformio` (pipx non era presente).

### 1.2 Prima build interrotta / cache corrotta
- **Sintomo**: il primo `pio run` (compilazione) scarica la toolchain
  ESP32 (~5 GB) e può essere interrotto; al primo errore in avvio:
  `Tool Manager: Could not parse manifest ... MissingPackageManifestError`.
- **Soluzione**: pulire la cache e rifare la build completa:
  ```bash
  rm -rf ~/.platformio/packages ~/.platformio/platforms ~/.platformio/.cache
  cd firmware && pio run
  ```
- **Nota**: le build successive sono veloci (toolchain già scaricata ~5,3 GB).

---

## 2. Errori di compilazione

### 2.1 `MK_TOKEN` usato in espressione `#if`
- **Sintomo**: `config.h:20: error: token """" is not valid in preprocessor expressions`
  con `#if defined(MK_TOKEN) && MK_TOKEN[0] != '\0'`.
- **Causa**: il preprocessore non può indicizzare stringhe macro.
- **Soluzione**: spostare il controllo a runtime:
  ```c
  #if defined(MK_TOKEN)
      const char* kToken = MK_TOKEN;
  #else
      const char* kToken = "";
  #endif
      if (kToken[0] != '\0' && strcmp(token, kToken) != 0) { ... }
  ```

### 2.2 `keyboardReport` rifiuta `const uint8_t*`
- **Sintomo**: `usb_hid.cpp: error: invalid conversion from 'const uint8_t*' to 'uint8_t*'`
- **Causa**: `Adafruit_USBD_HID::keyboardReport()` vuole un puntatore non-const
  (benché copia il buffer).
- **Soluzione**: `const_cast<uint8_t*>(keys)` (legale, il contenuto non è modificato).

---

## 3. Flash size: assert all'avvio (boot loop)

### 3.1 Sintomo
```
E (195) spi_flash: Detected size(4096k) smaller than the size in the binary
image header(8192k). Probe failed.
assert failed: __esp_system_init_fn_init_flash startup_funcs.c:118 (flash_ret == ESP_OK)
Backtrace: ... ELF file SHA256: ...
Rebooting... (loop infinito)
```

### 3.2 Causa
- La board in uso ha **4 MB di flash**, ma la board `esp32-s3-devkitc-1`
  di PlatformIO compila di default per **8 MB**: l'app verifica all'avvio
  la coerenza tra dimensione flash rilevata e header dell'immagine e va in assert.
- **Aggravante**: l'errore `esp_core_dump_flash: ... CRC=0x... instead of 0x0`
  nel log è solo rumore di accompagnamento (il core dump non riesce a scrivere).

### 3.3 Soluzione (e trappola!)
In `platformio.ini` **NON funziona** `board_build.flash_size` (ignorata):
la chiave giusta è:
```ini
board_upload.flash_size = 4MB
board_upload.maximum_size = 4194304
board_build.partitions = default.csv
```
Verifica che il binario sia corretto (byte 3, nibble alto dell'header:
`0x2` = 4 MB, `0x3` = 8 MB):
```bash
python3 -c "b=open('firmware/.pio/build/esp32s3/firmware.bin','rb').read(4); print(hex(b[3]>>4))"
```
Il log mostra anche "ELF file SHA256" ad ogni crash: confrontarla con
`sha256sum firmware/.pio/build/esp32s3/firmware.elf` dice se la scheda sta
eseguendo l'ultima build o una vecchia.

---

## 4. Crash all'avvio: `StoreProhibited` (ordine di init USB TinyUSB)

### 4.1 Sintomo
```
Guru Meditation Error: Core 1 panic'ed (StoreProhibited). Exception was unhandled.
EXCVADDR: 0x00000002
Backtrace: 0x420a59ec ... (Adafruit_USBD_Device::addInterface → Adafruit_USBD_HID::begin → usb_hid_begin → setup)
```

### 4.2 Causa
- `Adafruit_USBD_HID::begin()` → `addInterface()` scrive nei buffer dei
  descrittori `_desc_cfg`, ma **`TinyUSBDevice.begin()` non era mai stato
  chiamato** in `setup()`: buffer non allocati → scrittura su puntatore nullo.

### 4.3 Soluzione — ordine di init corretto in `main.cpp`
```cpp
TinyUSBDevice.begin();  // 1) alloca i buffer dei descrittori
usb_hid_begin();        // 2) le begin() delle interfacce le aggiungono (addInterface)
USB.begin();            // 3) avvia lo stack TinyUSB del core (serve i descrittori
                        //    tramite i callback strong di Adafruit tud_descriptor_*_cb)
```
Serve anche `#include <USB.h>` per `USB.begin()`.

### 4.4 Seconda trappola: `ARDUINO_USB_MODE`
Il file di progetto originale usava `-D ARDUINO_USB_MODE=1` (commento:
"USB in modalità OTG (TinyUSB)") — ma è l'inverso:
- `ARDUINO_USB_MODE=1` = "Hardware CDC e JTAG": NON funziona con
  Adafruit TinyUSB (lo stack è quello del core, i descrittori di Adafruit
  non vengono mai usati).
- `ARDUINO_USB_MODE=0` = "USB-OTG (TinyUSB)": quello che serve
  (ed è il default della piattaforma per l'ESP32-S3 se non specificato).
In più con `ARDUINO_USB_CDC_ON_BOOT=0` il core **non** fa init automatico
(`ARDUINO_USB_ON_BOOT = CDC|MSC|DFU`): va chiamato `USB.begin()` esplicitamente.

### 4.5 Come si simbolizza un backtrace
```bash
~/.platformio/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32s3-elf-addr2line \
  -pfiaC -e firmware/.pio/build/esp32s3/firmware.elf <indirizzi...>
```

### 4.6 Debug via JTAG (quando non ci sono log seriali)
- La porta USB-OTG/ROM (VID/PID 303a:1001) offre anche JTAG
  ("USB JTAG/serial debug unit").
- Serve OpenOCD (non preinstallato):
  ```bash
  pio pkg install --global --tool "platformio/tool-openocd"
  # permessi libusb: regola udev (vedi §6.3)
  ~/.platformio/packages/tool-openocd/bin/openocd \
    -f .../scripts/interface/esp_usb_jtag.cfg -f .../scripts/target/esp32s3.cfg
  ```
- ATTENZIONE: con OpenOCD agganciato, un reset del chip **riparte in
  download mode** (`boot:0x21 DOWNLOAD` nel log ROM) — per riavviare
  l'app: scolpare OpenOCD e fare `esptool run`, o meglio unplug/replug.
- Console telnet OpenOCD (porta 4444): `esp32s3.cpuX arp_examine`,
  `halt`, `reg` (PC, a0...), leggendo i registri si capisce dove è fermo
  il programma.
- gdb: usare `xtensa-esp-elf-gdb-no-python` (i binari "con python"
  richiedono `libpython3.x` non presente sul sistema).

---

## 5. Log seriali: la scheda single-USB non li rende visibili

### 5.1 Situazione
- La scheda ha un solo connettore USB-C che va direttamente al pin
  USB-OTG dell'S3: **nessun chip USB-UART, quindi niente porta COM per i log**.
- `Serial` (UART0) esiste ma non è cablata a USB.
- Quando il firmware gira e possiede il periferico USB, il cavo si presenta
  come HID e **la porta seriale sparisce**:
  ```
  lsusb → 303a:1001 Espressif ESP32-S3-DevKitC-1
  bInterfaceClass 3 Human Interface Device (×2 o ×3)
  ```
  Non è un problema: è il comportamento atteso.

### 5.2 Tentativo (fallito) di aggiungere un'interfaccia CDC di log
- Aggiungere un `Adafruit_USBD_CDC` + `log_init()` sembra l'approccio
  giusto per avere log sul cavo unico, ma:
  - con `CDC_ON_BOOT=0` la CDC va aggiunta a mano (l'abbiamo fatto);
  - l'interfaccia CDC è stata **silenziosamente scartata**
    (l'app girava ma la porta CDC non appariva mai) e i log non uscivano;
  - il tutto rendeva impossibile capire se il "crash" fosse reale
    (vedi §6: in realtà non lo era!).
- **Risoluzione finale**: niente CDC di log — i log restano su `Serial`
  (UART0, innocuo: chi ha una scheda con porta COM li vede, chi no no).
- **Cosa verificare se si vuole riprovarci**: `CFG_TUD_CDC` nel config
  TinyUSB (`tusb_config_esp32.h` della libreria Adafruit), l'ordine
  `TinyUSBDevice.begin() → cdc.begin() → hid.begin() → USB.begin()`,
  e la dimensione del buffer descrittori (`_desc_cfg_buffer[256]`).

### 5.3 Per osservare eventi input senza xinput (desktop Wayland)
- Su Wayland/Xwayland `xinput` non mostra i device raw.
- Serve evtest con sudo: `sudo evtest /dev/input/by-id/<kbd>` — i
  permessi di `/dev/input` sono solo di root/gruppo `input`.

---

## 6. Flash e download mode: comportamenti da conoscere

### 6.1 Sequenza di download mode
Con il firmware in esecuzione la porta USB è posseduta dall'app:
esptool non riesce a sincronizzarsi. Per flashare:
1. **scolcare il cavo**
2. **tenere premuto BOOT** (GPIO0)
3. **inserire il cavo** con BOOT tenuto (il power-on campiona GPIO0 basso)
4. tenere ancora ~2 secondi, poi rilasciare
5. verificare: `lsusb -d 303a:1001 -v` deve mostrare
   `bInterfaceClass 2 Communications` (ROM in download mode) e comparire
   `/dev/ttyACM*`
6. `pio run -t upload --upload-port /dev/ttyACM0`
7. **unplug/replug del cavo** (v. §6.2!) per far partire l'app

Il metodo "tieni BOOT + premi RST" funziona ma richiede di rilasciare
BOOT **dopo** il reset completo; il power-on con BOOT tenuto è più affidabile.
Se la ROM continua a mostrare HID invece di CDC, non si è entrati in
download mode (GPIO0 non era basso al reset).

### 6.2 Dopo il flash la scheda NON parte: resta in download mode
- **Sintomo**: upload riuscito ("Hash of data verified", "Hard resetting via
  RTS pin"), ma la scheda si rienumer come ROM e non fa partire l'app.
  Il log via CDC mostra `rst:0x15 (USB_UART_CHIP_RESET), boot:0x21 (DOWNLOAD)`,
  "waiting for download".
- **Causa**: comportamento noto: il reset effettuato da esptool tramite
  USB-Serial-JTAG riporta la ROM in download mode.
- **Soluzione**: **scolcare e ricollegare il cavo** (power cycle puro,
  senza premere nulla): la ROM campiona GPIO0 alto e avvia l'app.
  È l'unica azione affidabile, non usare i reset dell'host.

### 6.3 Permessi libusb per JTAG/OpenOCD
- **Sintomo**: `Error: libusb_open() failed with LIBUSB_ERROR_ACCESS`
- **Soluzione**:
  ```bash
  sudo sh -c 'echo "SUBSYSTEM==\"usb\", ATTRS{idVendor}==\"303a\", ATTRS{idProduct}==\"1001\", MODE=\"0666\"" > /etc/udev/rules.d/99-esp32s3.rules'
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```
  (Le versioni "redirect con sudo" falliscono per i permessi di shell;
  usare `sudo sh -c '...'` con tutto dentro.)

---

## 7. Configurazione TinyUSB: limite interfacce HID

- **Sintomo**: solo 2 interfacce HID enumerate nonostante 3 oggetti
  (`hid_kb`, `hid_mouse`, `hid_consumer`).
- **Causa**: `CFG_TUD_HID` vale **2** nella config TinyUSB della
  libreria Adafruit (`src/arduino/ports/esp32/tusb_config_esp32.h`):
  la terza istanza HID viene scartata in modo **silenzioso**
  (l'app non crasha, ma media keys/consumer non funzionano).
- **Soluzione**: patch del file in `.pio/libdeps`:
  `#define CFG_TUD_HID 3`.
  Nota: la patch vive in `.pio/libdeps` e viene persa se si fa
  `pio pkg update` — da tenere in considerazione (o ricreare con un hook
  di build `extra_script`).
- Il buffer descrittori della libreria è 256 byte: con più interfacce
  aggiuntive (es. CDC + HID ×3) ci si avvicina al limite.

---

## 8. Riepilogo configuration finale di `platformio.ini`

```ini
board = esp32-s3-devkitc-1
board_upload.flash_size = 4MB        ; la board ha 4 MB di flash
board_upload.maximum_size = 4194304
board_build.partitions = default.csv

build_flags =
    -D ARDUINO_USB_MODE=0            ; USB-OTG (TinyUSB), NON 1
    -D ARDUINO_USB_CDC_ON_BOOT=0     ; log su UART0; USB.begin() esplicito
    -D CORE_DEBUG_LEVEL=1
```

## 9. Checklist flash-and-run per la scheda single-USB

```bash
# 1) compilare
cd firmware && pio run

# 2) download mode: scolca cavo, tieni BOOT, reinserisci cavo, 2 s, rilascia
lsusb -d 303a:1001 -v | grep bInterfaceClass   # deve esserci "Communications"
ls /dev/ttyACM*

# 3) flash
pio run -t upload --upload-port /dev/ttyACM0

# 4) avvio app
scolca e ricollega il cavo senza premere nulla

# 5) verifica
lsusb -d 303a:1001 -v | grep -c "Human Interface Device"   # attese 3 interfacce
curl http://esp32-hid.local/status                          # {"fw":"0.1.0",...}
```

## 10. Strumenti utili usati in questa sessione

| Comando | Uso |
|---|---|
| `lsusb -d 303a:1001 -v` | vedere le classi interfaccia (CDC = ROM/HID = app) |
| `esptool read-flash 0x0 32 out.bin` | verificare magic bootloader/partizioni/app |
| `addr2line` (xtensa-esp32s3-elf-) | simbolizzare backtrace |
| `pio device monitor -b 115200` | log (solo su schede con porta COM) |
| OpenOCD + `esp_usb_jtag.cfg` | JTAG via USB-ROM: halt, reg, debug senza seriale |
| `evtest` (sudo) | osservare eventi EV_KEY del dispositivo HID |
