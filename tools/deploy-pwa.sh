#!/usr/bin/env bash
# Copia la build della PWA (app/dist) in firmware/data, pre-comprime gli asset
# statici (.js/.css) con gzip per ESPAsyncWebServer e carica il filesystem
# LittleFS sull'ESP32-S3 con `pio run -t uploadfs`.
#
# Uso:
#   ./tools/deploy-pwa.sh              # build + copia + gzip + uploadfs
#   ./tools/deploy-pwa.sh --no-build   # copia + gzip + uploadfs senza ricostruire
#   ./tools/deploy-pwa.sh --prep-only  # build + copia + gzip senza uploadfs
#
# NB: il flash del filesystem richiede la stessa procedura del firmware
# (download mode via BOOT + replug post-flash, v. docs/troubleshooting.md §6).

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

echo "==> compressione gzip asset (ESPAsyncWebServer serve *.gz in automatico)"
# Comprime assets/*.js e assets/*.css lasciando index.html/sw.js/manifest non
# compressi (<3 KB totali) per massima compatibilita' con captive portal e SW.
find firmware/data/assets -type f \( -name '*.js' -o -name '*.css' \) -exec gzip -9 {} +

SIZE_KB=$(du -sk firmware/data | awk '{print $1}')
echo "==> dimensione firmware/data: ${SIZE_KB} KB (partizione LittleFS: 384 KB)"
if [ "$SIZE_KB" -gt 340 ]; then
  echo "ATTENZIONE: firmware/data supera 340 KB, vicino al limite di LittleFS!" >&2
fi

if [ "$PREP_ONLY" -eq 1 ]; then
  echo "Fatto (--prep-only: uploadfs saltato)."
  exit 0
fi

echo "==> upload LittleFS ($PORT)"
cd firmware
pio run -e esp32s3 -t uploadfs --upload-port "$PORT"

echo
echo "Fatto. Al termine: unplug/replug del cavo (download mode), poi apri"
echo "la PWA dall'ESP (http://<ip-esp>/index.html — su AP: http://192.168.4.1/index.html)."
