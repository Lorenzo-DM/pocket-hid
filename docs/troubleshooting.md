# Firmware Troubleshooting Guide (ESP32-S3)

Reference log of hardware, TinyUSB, and flashing issues encountered on ESP32-S3 boards — especially **single-USB-C boards (direct OTG, no UART bridge)** — along with root causes, fixes, and diagnostic commands.

---

## 1. PlatformIO Installation

### 1.1 `pip install platformio` on PEP 668 ("externally managed") Linux systems
- **Symptom**: Debian/Ubuntu with Python 3.12 blocks global `pip install`.
- **Fix**: use `pipx install platformio` (recommended) or `pip3 install --user --break-system-packages platformio`.

### 1.2 Interrupted first build / corrupted cache
- **Symptom**: the first `pio run` downloads the ESP32 toolchain (~5 GB). If interrupted, subsequent runs may fail with `Tool Manager: Could not parse manifest ... MissingPackageManifestError`.
- **Fix**: clear PlatformIO's cache and rebuild:
  ```bash
  rm -rf ~/.platformio/packages ~/.platformio/platforms ~/.platformio/.cache
  cd firmware && pio run -e esp32s3
  ```

---

## 2. Compilation Pitfalls

### 2.1 `MK_TOKEN` in `#if` preprocessor expressions
- **Symptom**: `error: token """" is not valid in preprocessor expressions` when evaluating string macros in `#if`.
- **Cause**: the C preprocessor cannot index string literals.
- **Fix**: check `MK_TOKEN` at runtime (implemented via `mk_token_enabled()` / `mk_token_valid()` in `config.h`).

### 2.2 `keyboardReport` rejects `const uint8_t*`
- **Symptom**: `invalid conversion from 'const uint8_t*' to 'uint8_t*'`.
- **Cause**: `Adafruit_USBD_HID::keyboardReport()` takes a non-const pointer even though it only reads the buffer.
- **Fix**: `const_cast<uint8_t*>(keys)`.

---

## 3. Flash Size Boot Loop (`Detected size(4096k) smaller than ... 8192k`)

### 3.1 Symptom
```text
E (195) spi_flash: Detected size(4096k) smaller than the size in the binary
image header(8192k). Probe failed.
assert failed: __esp_system_init_fn_init_flash startup_funcs.c:118 (flash_ret == ESP_OK)
Rebooting...
```

### 3.2 Cause
`esp32-s3-devkitc-1` defaults to 8 MB flash in PlatformIO. On 4 MB boards, the firmware asserts at boot when the header flash size exceeds the physical chip size.

### 3.3 Fix
In `firmware/platformio.ini`, `board_build.flash_size` is ignored — use `board_upload.flash_size` instead:
```ini
board_upload.flash_size = 4MB
board_upload.maximum_size = 4194304
board_build.partitions = partitions_4mb.csv
```
Verify the compiled image header (byte 3 high nibble: `0x2` = 4 MB, `0x3` = 8 MB):
```bash
python3 -c "b=open('firmware/.pio/build/esp32s3/firmware.bin','rb').read(4); print(hex(b[3]>>4))"
```

---

## 4. Boot Crash: `StoreProhibited` (TinyUSB Init Order)

### 4.1 Symptom
```text
Guru Meditation Error: Core 1 panic'ed (StoreProhibited). Exception was unhandled.
EXCVADDR: 0x00000002
Backtrace: ... (Adafruit_USBD_Device::addInterface -> Adafruit_USBD_HID::begin -> usb_hid_begin -> setup)
```

### 4.2 Cause
`Adafruit_USBD_HID::begin()` writes into descriptor buffers that are only allocated after `TinyUSBDevice.begin()` is called.

### 4.3 Fix — Required init order in `main.cpp`
```cpp
TinyUSBDevice.begin();  // 1) allocate descriptor buffers
usb_hid_begin();        // 2) register HID interfaces (addInterface)
USB.begin();            // 3) start the core TinyUSB stack
```

### 4.4 `ARDUINO_USB_MODE` flag
- `ARDUINO_USB_MODE=1` = Hardware CDC/JTAG — **incompatible** with Adafruit TinyUSB.
- `ARDUINO_USB_MODE=0` = USB-OTG (TinyUSB) — **required**.
- With `ARDUINO_USB_CDC_ON_BOOT=0`, `USB.begin()` must be called explicitly.

### 4.5 Symbolizing a backtrace
```bash
~/.platformio/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32s3-elf-addr2line \
  -pfiaC -e firmware/.pio/build/esp32s3/firmware.elf <addresses...>
```

### 4.6 JTAG debugging (when no UART port is available)
- The ESP32-S3 USB-OTG ROM (`303a:1001`) exposes USB-JTAG.
- Install OpenOCD (`pio pkg install --global --tool "platformio/tool-openocd"`) and run with `esp_usb_jtag.cfg` + `esp32s3.cfg`.
- Note: resetting via OpenOCD leaves the chip in download mode — unplug and replug USB to boot the application.

---

## 5. Serial Logs on Single-USB Boards

- Single-USB-C ESP32-S3 boards wire the connector directly to USB-OTG with **no USB-UART bridge**.
- Once the firmware boots and enumerates as USB HID, the serial port disappears:
  ```text
  lsusb -> 303a:1001 Espressif ESP32-S3-DevKitC-1
  bInterfaceClass 3 Human Interface Device (x3)
  ```
  This is expected behavior. `Serial` logs still go to UART0 (visible on dual-USB boards or with an external USB-TTL adapter).
- On Linux Wayland desktops, inspect raw HID input events with:
  ```bash
  sudo evtest /dev/input/by-id/<keyboard-device>
  ```

---

## 6. Flashing & Download Mode (Single-USB Boards)

### 6.1 Entering download mode
When the firmware is running, USB is owned by TinyUSB HID and `esptool` cannot sync automatically:
1. Unplug the USB cable.
2. Hold the **BOOT** button (`GPIO0`).
3. Plug the USB cable back in while holding **BOOT**.
4. Wait ~2 seconds, then release **BOOT**.
5. Verify a serial device appears (`/dev/ttyACM*` on Linux, `/dev/cu.usbmodem*` on macOS, `COM*` on Windows) and `lsusb -d 303a:1001 -v` shows `bInterfaceClass 2 Communications`.
6. Flash firmware (`pio run -e esp32s3 -t upload`) and LittleFS (`pio run -e esp32s3 -t uploadfs`).
7. **Unplug and replug the USB cable** without holding BOOT.

### 6.2 Board stays in download mode after flashing
- **Symptom**: `esptool` reports `Hard resetting via RTS pin`, yet the board remains in ROM download mode (`boot:0x21 DOWNLOAD`).
- **Cause**: USB-Serial-JTAG reset does not reliably clear download mode on single-USB boards.
- **Fix**: perform a full power cycle by **unplugging and replugging** the USB cable.

### 6.3 Linux udev permissions (for USB-JTAG / serial)
```bash
sudo sh -c 'echo "SUBSYSTEM==\"usb\", ATTRS{idVendor}==\"303a\", ATTRS{idProduct}==\"1001\", MODE=\"0666\"" > /etc/udev/rules.d/99-esp32s3.rules'
sudo udevadm control --reload-rules && sudo udevadm trigger
```

---

## 7. TinyUSB HID Interface Limit (`CFG_TUD_HID`)

- **Symptom**: only 2 HID interfaces enumerate even though 3 are registered (`hid_kb`, `hid_mouse`, `hid_consumer`), so media keys silently fail.
- **Cause**: Adafruit TinyUSB defaults to `#define CFG_TUD_HID 2` in `tusb_config_esp32.h`.
- **Fix**: automated by the PlatformIO pre-build script [`firmware/scripts/patch_tinyusb.py`](../firmware/scripts/patch_tinyusb.py), which idempotently patches `CFG_TUD_HID` to `3` before every build.

---

## 8. Quick Verification Checklist

```bash
# Check 3 HID interfaces are enumerated (keyboard + mouse + consumer)
lsusb -d 303a:1001 -v | grep -c "Human Interface Device"   # expected: 3

# Check HTTP status endpoint over WiFi
curl http://pockethid.local/status
```
