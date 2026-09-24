#!/usr/bin/env bash
# Run the OttoNote Flutter app against the SAME Supabase project + backend as
# the Chrome extension, reading config from ../chrome/.env so no secrets are
# committed to the Flutter source. The Supabase anon key is a public client key.
#
# Usage:
#   tool/run_dev.sh                 # runs on chrome (web)
#   tool/run_dev.sh "iPhone 15"     # runs on a specific device/simulator
#   tool/run_dev.sh android         # runs on android (localhost auto-maps to 10.0.2.2)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="../chrome/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "warning: $ENV_FILE not found — SUPABASE_URL/ANON_KEY will be empty (sign-in disabled)."
fi

DEVICE="${1:-chrome}"

# "android" isn't a device id — resolve it to the first running Android device.
if [ "$DEVICE" = "android" ]; then
  RESOLVED=$(flutter devices --machine 2>/dev/null | python3 -c "
import json, sys
try:
    devs = json.load(sys.stdin)
except Exception:
    devs = []
print(next((d['id'] for d in devs if str(d.get('targetPlatform','')).startswith('android')), ''))
" 2>/dev/null)
  if [ -z "$RESOLVED" ]; then
    echo "No running Android device/emulator found."
    echo "Launch one first, e.g.: flutter emulators --launch Small_Phone"
    exit 1
  fi
  DEVICE="$RESOLVED"
fi

API="${VITE_API_BASE_URL:-http://localhost:8000}"

exec flutter run -d "$DEVICE" \
  --dart-define=API_BASE_URL="$API" \
  --dart-define=SUPABASE_URL="${VITE_SUPABASE_URL:-}" \
  --dart-define=SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
