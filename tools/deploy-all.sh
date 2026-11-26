#!/usr/bin/env bash
# Build, test, and flash the entire PocketHID project (PWA + ESP32-S3 firmware).
#
# Usage:
#   ./tools/deploy-all.sh                 # test + build + upload firmware and LittleFS
#   ./tools/deploy-all.sh --build-only    # test + build without uploading to ESP32
#   ./tools/deploy-all.sh --no-fw         # PWA only (build + uploadfs)
#   ./tools/deploy-all.sh --no-pwa        # firmware only (test + build + upload)
#   ./tools/deploy-all.sh --no-tests      # skip lint and native unit tests
#   ./tools/deploy-all.sh --android       # also run `cap sync android`
#   ./tools/deploy-all.sh --release       # also update tools/flash/
#   ./tools/deploy-all.sh --port /dev/... # force serial port (or set PIO_UPLOAD_PORT)

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
      [ $# -ge 2 ] || { echo "ERROR: --port requires an argument" >&2; exit 2; }
      PORT="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option '$1'" >&2
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
    echo "ERROR: PlatformIO (pio) not found in PATH." >&2
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

# 1. PWA: lint + build + copy/gzip into firmware/data
if [ "$DO_PWA" -eq 1 ]; then
  if [ "$DO_TESTS" -eq 1 ]; then
    step "Linting PWA (app/)"
    (cd "$ROOT/app" && npm run lint)
  fi

  step "Building and preparing PWA (firmware/data/)"
  "$ROOT/tools/deploy-pwa.sh" --prep-only
fi

# 2. Android (optional)
if [ "$DO_ANDROID" -eq 1 ]; then
  step "Syncing Capacitor Android"
  if [ "$DO_PWA" -eq 1 ]; then
    (cd "$ROOT/app" && npx cap sync android)
  else
    (cd "$ROOT/app" && npm run cap:sync)
  fi
fi

# 3. Firmware: native tests + ESP32-S3 build
if [ "$DO_FW" -eq 1 ]; then
  if [ "$DO_TESTS" -eq 1 ]; then
    step "Running firmware unit tests (pio test -e native)"
    (cd "$ROOT/firmware" && "$PIO" test -e native)
  fi

  step "Building ESP32-S3 firmware"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3)
fi

# 4. Web flasher release (optional)
if [ "$DO_RELEASE" -eq 1 ]; then
  step "Building LittleFS image (pio run -t buildfs)"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3 -t buildfs)
  step "Updating tools/flash/"
  "$ROOT/tools/make-flash-release.sh"
fi

# 5. Upload to ESP32-S3
if [ "$BUILD_ONLY" -eq 1 ] || { [ "$DO_FW" -eq 0 ] && [ "$DO_PWA" -eq 0 ]; }; then
  step "Build completed (upload skipped)"
  exit 0
fi

if [ -z "$PORT" ]; then
  if ! PORT="$(detect_port)"; then
    cat >&2 <<'EOF'

ERROR: no ESP32-S3 serial port found (/dev/cu.usbmodem*, /dev/ttyACM*, /dev/ttyUSB*).
To enter download mode on a single-USB board:
  1. Unplug the USB cable
  2. Hold BOOT
  3. Plug the cable back in and release BOOT after ~2s
Then re-run this script (or pass --port /dev/...).
EOF
    exit 1
  fi
fi

step "Detected serial port: $PORT"

if [ "$DO_FW" -eq 1 ]; then
  step "Uploading firmware to $PORT"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3 -t upload --upload-port "$PORT")
fi

if [ "$DO_PWA" -eq 1 ]; then
  step "Uploading LittleFS (PWA) to $PORT"
  (cd "$ROOT/firmware" && "$PIO" run -e esp32s3 -t uploadfs --upload-port "$PORT")
fi

cat <<'EOF'

==> All done!
Unplug and replug the USB cable (without holding BOOT) to start the firmware.
EOF
