#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

: "${RPC_URL:?RPC_URL is required}"
: "${CONTRACT:?CONTRACT is required}"

publish_one() {
  local name="$1"
  local file="$2"
  echo
  echo "=== publishing $name from $file ==="
  NAME="$name" FILE="$file" "$ROOT_DIR/scripts/pin-and-point-page.sh"
  local resolved
  resolved="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "$name" | tr -d '"')"
  echo "[$name] resolve => $resolved"
}

publish_one "www" "index.html"
sleep 8
publish_one "docs" "demos/docs/index.html"
sleep 8
publish_one "admin" "demos/admin/index.html"
sleep 8
publish_one "app" "demos/app/index.html"
sleep 8
publish_one "status" "demos/status/index.html"

echo
for h in www docs admin app status; do
  echo "--- $h.ipns.io links ---"
  curl -s "https://$h.ipns.io/?v=$(date +%s)" | grep -Eo 'href="https://[^"]+"' | head -n 10 || true
done
