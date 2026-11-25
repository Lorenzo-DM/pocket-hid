#!/usr/bin/env bash
# Assembla tools/flash/ con i binari prodotti da PlatformIO + manifest.json
# per la pagina di flash web (ESP Web Tools).
#
# Uso:
#   1) pio run -e esp32s3           (in firmware/)
#   2) tools/make-flash-release.sh
#   3) pubblicare tools/flash/ su GitHub Pages (v. tools/flash/README.md)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FW_DIR="$ROOT/firmware"
BUILD="$FW_DIR/.pio/build/esp32s3"
OUT="$ROOT/tools/flash"
CORE_DIR="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}"
BOOT_APP0="$CORE_DIR/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"

missing=0
for f in "$BUILD/firmware.bin" "$BUILD/bootloader.bin" "$BUILD/partitions.bin" "$BOOT_APP0"; do
  if [ ! -f "$f" ]; then echo "mancante: $f"; missing=1; fi
done
if [ "$missing" = 1 ]; then
  echo "Compilare prima: pio run -e esp32s3   (in firmware/)"
  exit 1
fi

VERSION=$(grep -o 'MK_FW_VERSION "[^"]*"' "$FW_DIR/src/config.h" | cut -d'"' -f2)
[ -n "$VERSION" ] || { echo "versione non trovata in config.h"; exit 1; }

cp "$BUILD/firmware.bin"   "$OUT/firmware.bin"
cp "$BUILD/bootloader.bin" "$OUT/bootloader.bin"
cp "$BUILD/partitions.bin" "$OUT/partitions.bin"
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
        { "path": "firmware.bin", "offset": 65536 }
      ]
    }
  ]
}
EOF

ls -la "$OUT"
echo "OK: tools/flash aggiornato (fw $VERSION)"
