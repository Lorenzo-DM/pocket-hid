#!/usr/bin/env bash
# Compila, testa e carica tutto il progetto PocketHID (PWA + firmware ESP32-S3).
#
# Uso:
#   ./tools/deploy-all.sh                 # test + build + upload firmware e LittleFS
#   ./tools/deploy-all.sh --build-only    # test + build senza upload su ESP32
#   ./tools/deploy-all.sh --no-fw         # solo PWA (build + uploadfs)
#   ./tools/deploy-all.sh --no-pwa        # solo firmware (test + build + upload)
#   ./tools/deploy-all.sh --no-tests      # salta lint e test nativi
#   ./tools/deploy-all.sh --android       # aggiunge `cap sync android`
#   ./tools/deploy-all.sh --release       # aggiorna anche tools/flash/
#   ./tools/deploy-all.sh --port /dev/... # forza la porta seriale (o PIO_UPLOAD_PORT)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BUILD_ONLY=0
DO_TESTS=1
DO_FW=1
DO_PWA=1
DO_ANDROID=0
DO_RELEASE=0
PORT="${PIO_UPLOAD_PORT:-}"

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=1 ;;
    --no-tests)   DO_TESTS=0 ;;
    --no-fw)      DO_FW=0 ;;
    --no-pwa)     DO_PWA=0 ;;
    --android)    DO_ANDROID=1 ;;
    --release)    DO_RELEASE=1 ;;
    -p|--port)
      [ $# -ge 2 ] || { echo "ERRORE: --port richiede un argomento" >&2; exit 2; }
      PORT="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERRORE: opzione sconosciuta '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

find_pio() {
  if command -v pio >/dev/null 2>&1; then
    command -v pio
  elif [ -x "$HOME/.platformio/penv/bin/pio" ]; then
    echo "$HOME/.platformio/penv/bin/pio"
  elif [ -x "$HOME/.local/bin/pio" ]; then
    echo "$HOME/.local/bin/pio"
  else
    echo "ERRORE: PlatformIO (pio) non trovato nel PATH." >&2
    exit 1
  fi
}

detect_port() {
  local p
  for p in /dev/cu.usbmodem* /dev/ttyACM* /dev/ttyUSB*; do
    if [ -e "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

step() {
  printf '\n==> %s\n' "$1"
}

PIO=""
if [ "$DO_FW" -eq 1 ] || { [ "$DO_PWA" -eq 1 ] && [ "$BUILD_ONLY" -eq 0 ]; }; then
  PIO="$(find_pio)"
fi

# 1. PWA: lint + build + copia/gzip in firmware/data
if [ "$DO_PWA" -eq 1 ]; then
  if [ "$DO_TESTS" -eq 1 ]; then
    step "Lint PWA (app/)"
    (cd "$ROOT/app" && npm run lint)
  fi

  step "Build e preparazione PWA (firmware/data/)"
  "$ROOT/tools/deploy-pwa.sh" --prep-only
fi

# 2. Android (opzionale)
if [ "$DO_ANDROID" -eq 1 ]; then
  step "Sync Capacitor Android"
  if [ "$DO_PWA" -eq 1 ]; then
    (cd "$ROOT/app" && npx cap sync android)
  else
    (cd "$ROOT/app" && npm run cap:sync)
  fi
fi

# 3. Firmware: test nativi + build ESP32-S3
if [ "$DO_FW" -eq 1 ]; then
  if [ "$DO_TESTS" -eq 1 ]; then
    step "Test unitari firmware (pio test -e native)"
    (cd "$ROOT/firmware" && "$PIO" test -e native)
  fi

  step "Build firmware ESP32-S3"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3)
fi

# 4. Web flasher release (opzionale)
if [ "$DO_RELEASE" -eq 1 ]; then
  step "Aggiornamento tools/flash/"
  "$ROOT/tools/make-flash-release.sh"
fi

# 5. Upload su ESP32-S3
if [ "$BUILD_ONLY" -eq 1 ] || { [ "$DO_FW" -eq 0 ] && [ "$DO_PWA" -eq 0 ]; }; then
  step "Build completata (upload saltato)"
  exit 0
fi

if [ -z "$PORT" ]; then
  if ! PORT="$(detect_port)"; then
    cat >&2 <<'EOF'

ERRORE: nessuna porta seriale ESP32-S3 trovata (/dev/cu.usbmodem*, /dev/ttyACM*, /dev/ttyUSB*).
Per entrare in download mode sulla board single-USB:
  1. scollega il cavo USB
  2. tieni premuto BOOT
  3. ricollega il cavo e rilascia BOOT dopo ~2s
Poi rilancia lo script (oppure specifica --port /dev/...).
EOF
    exit 1
  fi
fi

step "Porta seriale rilevata: $PORT"

if [ "$DO_FW" -eq 1 ]; then
  step "Upload firmware su $PORT"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3 -t upload --upload-port "$PORT")
fi

if [ "$DO_PWA" -eq 1 ]; then
  step "Upload LittleFS (PWA) su $PORT"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3 -t uploadfs --upload-port "$PORT")
fi

cat <<'EOF'

==> Tutto completato!
Scollega e ricollega il cavo USB (senza premere BOOT) per avviare il firmware.
EOF
