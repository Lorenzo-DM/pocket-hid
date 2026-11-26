#!/usr/bin/env bash
# Copy the PWA build (app/dist) into firmware/data, pre-compress static assets
# (.js/.css) with gzip for ESPAsyncWebServer, and upload the LittleFS image
# to the ESP32-S3 via `pio run -t uploadfs`.
#
# Usage:
#   ./tools/deploy-pwa.sh              # build + copy + gzip + uploadfs
#   ./tools/deploy-pwa.sh --no-build   # copy + gzip + uploadfs without rebuilding
#   ./tools/deploy-pwa.sh --prep-only  # build + copy + gzip without uploadfs
#
# Note: flashing the filesystem requires the same procedure as the firmware
# (download mode via BOOT + replug after flashing, see docs/troubleshooting.md).

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$PWD"
PORT="${PIO_UPLOAD_PORT:-/dev/ttyACM0}"
NO_BUILD=0
PREP_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --prep-only) PREP_ONLY=1 ;;
  esac
done

if [ "$NO_BUILD" -eq 0 ]; then
  echo "==> Building PWA (npm run build in app/)"
  (cd app && npm run build)
fi

if [ ! -f app/dist/index.html ]; then
  echo "ERROR: app/dist/index.html missing — run the build first" >&2
  exit 1
fi

echo "==> Copying app/dist -> firmware/data"
rm -rf firmware/data
mkdir -p firmware/data
cp -r app/dist/. firmware/data/

echo "==> Gzip-compressing assets (ESPAsyncWebServer serves *.gz automatically)"
# Compress assets/*.js and assets/*.css while keeping index.html/sw.js/manifest
# uncompressed (<3 KB total) for best captive portal and Service Worker compatibility.
find firmware/data/assets -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -9 {} +

SIZE_KB=$(du -sk firmware/data | awk '{print $1}')
echo "==> firmware/data size: ${SIZE_KB} KB (LittleFS partition: 384 KB)"
if [ "$SIZE_KB" -gt 340 ]; then
  echo "WARNING: firmware/data exceeds 340 KB, close to the LittleFS partition limit!" >&2
fi

if [ "$PREP_ONLY" -eq 1 ]; then
  echo "Done (--prep-only: uploadfs skipped)."
  exit 0
fi

echo "==> Uploading LittleFS ($PORT)"
cd firmware
pio run -e esp32s3 -t uploadfs --upload-port "$PORT"

echo
echo "Done. Unplug and replug the USB cable (to exit download mode), then open"
echo "the PWA from the ESP32 (http://pockethid.local/ — on AP: http://192.168.4.1/)."
