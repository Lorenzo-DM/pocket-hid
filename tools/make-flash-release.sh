#!/usr/bin/env bash
# Assemble tools/flash/ with PlatformIO firmware + LittleFS binaries and
# manifest.json for ESP Web Tools (browser installer).
#
# Usage:
#   1) ./tools/deploy-pwa.sh --prep-only
#   2) (cd firmware && pio run -e esp32s3 && pio run -e esp32s3 -t buildfs)
#   3) ./tools/make-flash-release.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FW_DIR="$ROOT/firmware"
BUILD="$FW_DIR/.pio/build/esp32s3"
OUT="$ROOT/tools/flash"
CORE_DIR="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}"
BOOT_APP0="$CORE_DIR/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"

missing=0
for f in "$BUILD/firmware.bin" "$BUILD/bootloader.bin" "$BUILD/partitions.bin" "$BUILD/littlefs.bin" "$BOOT_APP0"; do
  if [ ! -f "$f" ]; then
    echo "missing: $f" >&2
    missing=1
  fi
done
if [ "$missing" = 1 ]; then
  echo "Build firmware and LittleFS first:" >&2
  echo "  ./tools/deploy-pwa.sh --prep-only" >&2
  echo "  (cd firmware && pio run -e esp32s3 && pio run -e esp32s3 -t buildfs)" >&2
  exit 1
fi

VERSION=$(grep -o 'MK_FW_VERSION "[^"]*"' "$FW_DIR/src/config.h" | cut -d'"' -f2)
[ -n "$VERSION" ] || { echo "MK_FW_VERSION not found in config.h" >&2; exit 1; }

cp "$BUILD/firmware.bin"   "$OUT/firmware.bin"
cp "$BUILD/bootloader.bin" "$OUT/bootloader.bin"
cp "$BUILD/partitions.bin" "$OUT/partitions.bin"
cp "$BUILD/littlefs.bin"   "$OUT/littlefs.bin"
cp "$BOOT_APP0"            "$OUT/boot_app0.bin"

cat > "$OUT/manifest.json" <<EOF
{
  "name": "PocketHID",
  "version": "$VERSION",
  "new_install_prompt_erase": true,
  "builds": [
    {
      "chipFamily": "ESP32-S3",
      "parts": [
        { "path": "bootloader.bin", "offset": 0 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "firmware.bin", "offset": 65536 },
        { "path": "littlefs.bin", "offset": 3735552 }
      ]
    }
  ]
}
EOF

ls -la "$OUT"
echo "OK: tools/flash updated (fw $VERSION + LittleFS PWA)"
