#!/usr/bin/env bash
set -euo pipefail

# One-command flow:
# 1) Pin ./demos folder to Pinata as a directory
# 2) Update onchain CID for NAME (default: demo)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="${DEMO_DIR:-$ROOT_DIR/demos}"
NAME="${NAME:-demo}"
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${PINATA_JWT:?PINATA_JWT is required}"
: "${CONTRACT:?CONTRACT is required}"
: "${PRIVATE_KEY:?PRIVATE_KEY is required}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast (foundry) is required" >&2
  exit 1
fi

if [[ ! -d "$DEMO_DIR" ]]; then
  echo "Demo directory not found: $DEMO_DIR" >&2
  exit 1
fi

mapfile -t FILES < <(cd "$DEMO_DIR" && find . -type f | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No files found in $DEMO_DIR" >&2
  exit 1
fi

echo "Pinning directory to Pinata: $DEMO_DIR"

FORM_ARGS=(
  -F 'pinataMetadata={"name":"ipns-demo-site"};type=application/json'
  -F 'pinataOptions={"cidVersion":1,"wrapWithDirectory":true};type=application/json'
)

for rel in "${FILES[@]}"; do
  rel_no_prefix="${rel#./}"
  FORM_ARGS+=( -F "file=@${DEMO_DIR}/${rel_no_prefix};filename=${rel_no_prefix}" )
done

RESP="$({
  curl -sS --fail https://api.pinata.cloud/pinning/pinFileToIPFS \
    -H "Authorization: Bearer ${PINATA_JWT}" \
    "${FORM_ARGS[@]}"
})"

CID="$(printf '%s' "$RESP" | jq -r '.IpfsHash // empty')"
if [[ -z "$CID" ]]; then
  echo "Pinata response did not include IpfsHash" >&2
  echo "$RESP" >&2
  exit 1
fi

echo "Pinned CID: $CID"

echo "Updating onchain name: $NAME"
TX_JSON="$(cast send --json --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$CONTRACT" "setCID(string,string)" "$NAME" "$CID")"
TX_HASH="$(printf '%s' "$TX_JSON" | jq -r '.transactionHash // empty')"

if [[ -z "$TX_HASH" ]]; then
  echo "Unable to parse tx hash from cast output" >&2
  echo "$TX_JSON" >&2
  exit 1
fi

echo "TX: $TX_HASH"

# Best effort receipt wait
cast receipt --rpc-url "$RPC_URL" "$TX_HASH" >/dev/null || true

echo
echo "Done."
echo "CID: $CID"
echo "TX : $TX_HASH"
echo "URL: https://${NAME}.ipns.io/"
