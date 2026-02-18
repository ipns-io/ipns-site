#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
YEARS="${YEARS:-1}"
SKIP_REGISTER="${SKIP_REGISTER:-0}"
GAS_LIMIT="${GAS_LIMIT:-300000}"
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
: "${NAME:?NAME is required (e.g. whitepaper)}"
: "${FILE:?FILE is required (absolute or relative path to html)}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi
if ! command -v cast >/dev/null 2>&1; then
  echo "cast (foundry) is required" >&2
  exit 1
fi

if [[ "$FILE" != /* ]]; then
  FILE="$ROOT_DIR/$FILE"
fi
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

OWNER="$(cast wallet address --private-key "$PRIVATE_KEY")"

extract_tx_hash() {
  local input="$1"
  local tx=""
  tx="$(printf '%s' "$input" | jq -r '.transactionHash // empty' 2>/dev/null || true)"
  if [[ -z "$tx" ]]; then
    tx="$(printf '%s' "$input" | grep -Eo '0x[0-9a-fA-F]{64}' | head -n1 || true)"
  fi
  printf '%s' "$tx"
}

send_json() {
  local method_sig="$1"
  shift
  local attempts=0
  local max_attempts=8
  local out=""
  local owner_nonce
  owner_nonce="$(cast nonce --rpc-url "$RPC_URL" --block pending "$OWNER")"
  local gas_price
  gas_price="$(cast gas-price --rpc-url "$RPC_URL" 2>/dev/null || true)"
  if [[ -z "$gas_price" ]]; then
    gas_price=1000000000
  fi
  while (( attempts < max_attempts )); do
    local nonce
    nonce="$((owner_nonce + attempts))"
    local bumped_gas
    bumped_gas="$(( gas_price + (gas_price / 5) * attempts ))"
    set +e
    out="$(cast send --async --json --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-price "$bumped_gas" --gas-limit "$GAS_LIMIT" --nonce "$nonce" "$CONTRACT" "$method_sig" "$@" 2>&1)"
    local code=$?
    set -e
    if [[ $code -eq 0 ]]; then
      printf '%s' "$out"
      return 0
    fi
    if printf '%s' "$out" | grep -Eqi "nonce too low|replacement transaction underpriced|already known|known transaction"; then
      attempts=$((attempts + 1))
      sleep 2
      continue
    fi
    printf '%s\n' "$out" >&2
    return $code
  done
  printf '%s\n' "$out" >&2
  return 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
cp "$FILE" "$TMP_DIR/index.html"

echo "[$NAME] pinning $FILE"
PIN_RESP="$({
  curl -sS --fail https://api.pinata.cloud/pinning/pinFileToIPFS \
    -H "Authorization: Bearer ${PINATA_JWT}" \
    -F "pinataMetadata={\"name\":\"ipns-${NAME}-surface\"};type=application/json" \
    -F 'pinataOptions={"cidVersion":1,"wrapWithDirectory":true};type=application/json' \
    -F "file=@${TMP_DIR}/index.html;filename=index.html"
})"
CID="$(printf '%s' "$PIN_RESP" | jq -r '.IpfsHash // empty')"
if [[ -z "$CID" ]]; then
  echo "Failed to parse CID from Pinata response" >&2
  echo "$PIN_RESP" >&2
  exit 1
fi

echo "[$NAME] CID: $CID"

if [[ "$SKIP_REGISTER" == "1" ]]; then
  echo "[$NAME] register skipped (SKIP_REGISTER=1)"
else
  echo "[$NAME] register (if needed)"
  set +e
  AVAIL_OUT="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "isAvailable(string)(bool)" "$NAME" 2>&1)"
  AVAIL_CODE=$?
  set -e
  if [[ $AVAIL_CODE -ne 0 ]]; then
    echo "[$NAME] availability check failed, continuing without register"
  else
    AVAIL="$(printf '%s' "$AVAIL_OUT" | tr -d '"' | tr '[:upper:]' '[:lower:]')"
    if [[ "$AVAIL" == "false" ]]; then
      echo "[$NAME] already registered/unavailable, continuing"
    else
      set +e
      PRICE="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "getPrice(string,uint8)(uint256)" "$NAME" "$YEARS" 2>/dev/null | awk '{print $1}')"
      set -e
      if [[ -z "${PRICE:-}" ]]; then
        echo "[$NAME] price lookup failed, continuing without register"
      else
        set +e
        REG_OUT="$(send_json "register(string,uint8)" "$NAME" "$YEARS" --value "$PRICE" 2>&1)"
        REG_CODE=$?
        set -e
        if [[ $REG_CODE -eq 0 ]]; then
          REG_TX="$(extract_tx_hash "$REG_OUT")"
          if [[ -n "$REG_TX" ]]; then
            echo "[$NAME] register tx: $REG_TX"
          fi
        else
          if printf '%s' "$REG_OUT" | grep -Eiq 'NameUnavailable|already|revert|reverted|NameReservedError'; then
            echo "[$NAME] already registered/unavailable, continuing"
          else
            echo "[$NAME] register failed:" >&2
            echo "$REG_OUT" >&2
            exit 1
          fi
        fi
      fi
    fi
  fi
fi

echo "[$NAME] setCID"
SET_OUT="$(send_json "setCID(string,string)" "$NAME" "$CID")"
SET_TX="$(extract_tx_hash "$SET_OUT")"
if [[ -z "$SET_TX" ]]; then
  echo "[$NAME] could not parse setCID tx hash" >&2
  echo "$SET_OUT" >&2
  exit 1
fi
set +e
cast receipt --rpc-url "$RPC_URL" "$SET_TX" >/dev/null
RECEIPT_CODE=$?
set -e
if [[ $RECEIPT_CODE -ne 0 ]]; then
  echo "[$NAME] receipt not confirmed yet; checking resolve() until CID matches"
fi

MATCHED=0
for _ in {1..30}; do
  CURRENT="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "$NAME" | tr -d '"')"
  if [[ "$CURRENT" == "$CID" ]]; then
    MATCHED=1
    break
  fi
  sleep 4
done

if [[ $MATCHED -ne 1 ]]; then
  echo "[$NAME] setCID tx submitted but resolve() did not update to expected CID in time" >&2
  echo "[$NAME] expected: $CID" >&2
  echo "[$NAME] tx: $SET_TX" >&2
  exit 1
fi

echo

echo "Done."
echo "Name: $NAME"
echo "CID : $CID"
echo "TX  : $SET_TX"
echo "URL : https://${NAME}.ipns.io/"
