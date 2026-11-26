"""PlatformIO pre-build hook: ensures CFG_TUD_HID >= 3 in Adafruit TinyUSB.

Adafruit TinyUSB for ESP32 defaults to CFG_TUD_HID = 2, silently dropping the
3rd HID interface (Consumer Control / media keys). This script applies the
patch idempotently before compilation.
"""

import os
import re

Import("env")  # noqa: F821 (provided by PlatformIO SCons)

libdeps_dir = env.subst("$PROJECT_LIBDEPS_DIR/$PIOENV")
target = os.path.join(
    libdeps_dir,
    "Adafruit TinyUSB Library",
    "src",
    "arduino",
    "ports",
    "esp32",
    "tusb_config_esp32.h",
)

if os.path.isfile(target):
    with open(target, "r", encoding="utf-8") as f:
        src = f.read()

    pattern = r"(#define\s+CFG_TUD_HID\s+)(\d+)"
    m = re.search(pattern, src)
    if m and int(m.group(2)) < 3:
        patched = re.sub(pattern, r"\g<1>3", src, count=1)
        with open(target, "w", encoding="utf-8") as f:
            f.write(patched)
        print("[patch_tinyusb] Patched CFG_TUD_HID -> 3 in", target)
