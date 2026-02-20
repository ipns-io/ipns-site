#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
GAS_LIMIT="${GAS_LIMIT:-300000}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${CONTRACT:?CONTRACT is required}"
: "${PRIVATE_KEY:?PRIVATE_KEY is required}"

NAME="${1:-}"
CID="${2:-}"

if [[ -z "$NAME" || -z "$CID" ]]; then
  echo "Usage: $0 <name> <cid>" >&2
  exit 1
fi

is_valid_cid() {
  local cid="$1"
  [[ "$cid" =~ ^Qm[1-9A-HJ-NP-Za-km-z]{44}$ || "$cid" =~ ^baf[abcdefghijklmnopqrstuvwxyz234567]{20,}$ ]]
}

is_placeholder_cid() {
  local cid="$1"
  [[ "$cid" == *"<"* || "$cid" == *">"* || "$cid" == *"BUNDLE_CID"* || "$cid" == "null" || -z "$cid" ]]
}

if is_placeholder_cid "$CID"; then
  echo "Refusing placeholder/empty CID: $CID" >&2
  exit 1
fi

if ! is_valid_cid "$CID"; then
  echo "Refusing invalid CID format: $CID" >&2
  exit 1
fi

echo "Setting $NAME -> $CID"
cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit "$GAS_LIMIT" \
  "$CONTRACT" "setCID(string,string)" "$NAME" "$CID"

echo "Verifying resolve($NAME)"
RESOLVED="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "$NAME" | tr -d '"')"
echo "resolve($NAME)=$RESOLVED"
if [[ "$RESOLVED" != "$CID" ]]; then
  echo "Mismatch: expected $CID" >&2
  exit 1
fi

echo "Done."
