#!/bin/sh
# Render template.html to adapta-door-sheet-letter.pdf (US Letter landscape).
# Regenerates the PDF whenever template.html / template.js print output changes.

set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  if command -v google-chrome >/dev/null 2>&1; then
    CHROME=$(command -v google-chrome)
  elif command -v chromium >/dev/null 2>&1; then
    CHROME=$(command -v chromium)
  else
    echo "Chrome/Chromium not found" >&2
    exit 1
  fi
fi

PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python3 - "$PORT" <<'PY'
import sys, time, urllib.request
port = sys.argv[1]
url = "http://127.0.0.1:%s/template.html" % port
deadline = time.time() + 8
last = None
while time.time() < deadline:
    try:
        urllib.request.urlopen(url, timeout=0.5)
        sys.exit(0)
    except Exception as err:
        last = err
        time.sleep(0.1)
sys.stderr.write("http.server did not start: %s\n" % last)
sys.exit(1)
PY

OUT="$ROOT/adapta-door-sheet-letter.pdf"
rm -f "$OUT"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-pdf-header-footer \
  --virtual-time-budget=10000 \
  --run-all-compositor-stages-before-draw \
  --print-to-pdf="$OUT" \
  "http://127.0.0.1:${PORT}/template.html"

if [ ! -s "$OUT" ]; then
  echo "PDF was not written" >&2
  exit 1
fi
echo "Wrote $OUT"
