#!/usr/bin/env bash
# Copia la build della PWA (app/dist) in firmware/data e la carica sul filesystem
# LittleFS dell'ESP32-S3 con `pio run -t uploadfs`.
#
# Uso:
#   ./tools/deploy-pwa.sh              # build + copia + uploadfs
#   ./tools/deploy-pwa.sh --no-build   # copia + uploadfs senza ricostruire
#
# NB: il flash del filesystem richiede la stessa procedura del firmware
# (download mode via BOOT + replug post-flash, v. docs/troubleshooting.md §6).

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$PWD"
PORT="${PIO_UPLOAD_PORT:-/dev/ttyACM0}"

if [ "${1:-}" != "--no-build" ]; then
  echo "==> build PWA (npm run build in app/)"
  (cd app && npm run build)
fi

if [ ! -f app/dist/index.html ]; then
  echo "ERRORE: app/dist/index.html mancante — esegui prima la build" >&2
  exit 1
fi

echo "==> copia app/dist -> firmware/data"
rm -rf firmware/data
mkdir -p firmware/data
cp -r app/dist/. firmware/data/

echo "==> upload LittleFS ($PORT)"
cd firmware
pio run -e esp32s3 -t uploadfs --upload-port "$PORT"

echo
echo "Fatto. Al termine: unplug/replug del cavo (download mode), poi apri"
echo "la PWA dall'ESP (http://<ip-esp>/index.html — su AP: http://192.168.4.1/index.html)."
