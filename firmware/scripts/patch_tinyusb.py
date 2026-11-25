"""PlatformIO pre-build hook: assicura CFG_TUD_HID >= 3 in Adafruit TinyUSB.

La libreria Adafruit TinyUSB per ESP32 definisce di default CFG_TUD_HID = 2,
scartando silenziosamente la 3ª interfaccia HID (Consumer Control / media keys).
Questo script applica la patch in modo idempotente prima della compilazione.
"""

import os
import re

Import("env")  # noqa: F821 (fornito da PlatformIO SCons)

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
