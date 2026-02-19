#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
YEARS="${YEARS:-1}"
AUTO_UNRESERVE_RESERVED="${AUTO_UNRESERVE_RESERVED:-0}"
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

wait_for_tx() {
  local tx_hash="$1"
  local label="${2:-tx}"
  if [[ -z "$tx_hash" ]]; then
    return 1
  fi
  echo "[$label] waiting for confirmation: $tx_hash"
  cast receipt --rpc-url "$RPC_URL" "$tx_hash" >/dev/null
}

send_json() {
  local method_sig="$1"
  shift
  local owner
  owner="$(cast wallet address --private-key "$PRIVATE_KEY")"
  local base_nonce
  base_nonce="$(cast nonce --rpc-url "$RPC_URL" --block pending "$owner")"
  local gas_price
  gas_price="$(cast gas-price --rpc-url "$RPC_URL" 2>/dev/null || true)"
  if [[ -z "$gas_price" ]]; then
    gas_price=1000000000
  fi

  local attempts=0
  local max_attempts=8
  local out=""
  while (( attempts < max_attempts )); do
    local nonce
    nonce="$((base_nonce + attempts))"
    local bumped_gas
    bumped_gas="$(( gas_price + (gas_price / 5) * attempts ))"

    set +e
    out="$(cast send --json --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-price "$bumped_gas" --nonce "$nonce" "$CONTRACT" "$method_sig" "$@" 2>&1)"
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

is_valid_cid() {
  local cid="$1"
  [[ "$cid" =~ ^Qm[1-9A-HJ-NP-Za-km-z]{44}$ || "$cid" =~ ^baf[abcdefghijklmnopqrstuvwxyz234567]{20,}$ ]]
}

NAMES=(demo demo-docs demo-admin demo-app demo-status)

echo "Deploying surfaces from: $ROOT_DIR/demos"

CIDS=()
FAILURES=()
for name in "${NAMES[@]}"; do
  case "$name" in
    demo) dir="$ROOT_DIR/demos/www" ;;
    demo-docs) dir="$ROOT_DIR/demos/docs" ;;
    demo-admin) dir="$ROOT_DIR/demos/admin" ;;
    demo-app) dir="$ROOT_DIR/demos/app" ;;
    demo-status) dir="$ROOT_DIR/demos/status" ;;
    *) echo "Unknown name mapping: $name" >&2; exit 1 ;;
  esac
  file="$dir/index.html"
  if [[ ! -f "$file" ]]; then
    echo "Missing: $file" >&2
    exit 1
  fi

  echo
  echo "[$name] pinning $file"
  resp="$({
    curl -sS --fail https://api.pinata.cloud/pinning/pinFileToIPFS \
      -H "Authorization: Bearer ${PINATA_JWT}" \
      -F "pinataMetadata={\"name\":\"ipns-surface-${name}\"};type=application/json" \
      -F 'pinataOptions={"cidVersion":1,"wrapWithDirectory":true};type=application/json' \
      -F "file=@${file};filename=index.html"
  })"

  cid="$(printf '%s' "$resp" | jq -r '.IpfsHash // empty')"
  if [[ -z "$cid" || "$cid" == "null" ]]; then
    echo "[$name] failed to parse CID" >&2
    echo "$resp" >&2
    exit 1
  fi
  if ! is_valid_cid "$cid"; then
    echo "[$name] invalid CID from Pinata: $cid" >&2
    echo "$resp" >&2
    exit 1
  fi
  CIDS+=("$cid")
  echo "[$name] CID: $cid"
done

for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  cid="${CIDS[$i]}"

  echo
  echo "[$name] registering (if needed)"
  set +e
  price="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "getPrice(string,uint8)(uint256)" "$name" "$YEARS" | awk '{print $1}')"
  reg_out="$(send_json "register(string,uint8)" "$name" "$YEARS" --value "$price" 2>&1)"
  reg_code=$?
  set -e

  if [[ $reg_code -eq 0 ]]; then
    reg_tx="$(printf '%s' "$reg_out" | jq -r '.transactionHash // empty' 2>/dev/null || true)"
    if [[ -n "$reg_tx" ]]; then
      echo "[$name] registered tx: $reg_tx"
      wait_for_tx "$reg_tx" "$name register"
    else
      echo "[$name] registered"
    fi
  else
    if printf '%s' "$reg_out" | grep -Eiq 'NameReservedError'; then
      if [[ "$AUTO_UNRESERVE_RESERVED" == "1" ]]; then
        echo "[$name] reserved: unreserving as owner and retrying register"
        unreserve_json="$(send_json "unreserveName(string)" "$name")"
        unreserve_tx="$(printf '%s' "$unreserve_json" | jq -r '.transactionHash // empty' 2>/dev/null || true)"
        if [[ -n "$unreserve_tx" ]]; then
          echo "[$name] unreserve tx: $unreserve_tx"
          wait_for_tx "$unreserve_tx" "$name unreserve"
        fi
        price="$(cast call --rpc-url "$RPC_URL" "$CONTRACT" "getPrice(string,uint8)(uint256)" "$name" "$YEARS" | awk '{print $1}')"
        reg_out="$(send_json "register(string,uint8)" "$name" "$YEARS" --value "$price" 2>&1)"
        reg_code=$?
        if [[ $reg_code -eq 0 ]]; then
          reg_tx="$(printf '%s' "$reg_out" | jq -r '.transactionHash // empty' 2>/dev/null || true)"
          if [[ -n "$reg_tx" ]]; then
            echo "[$name] registered tx: $reg_tx"
            wait_for_tx "$reg_tx" "$name register"
          else
            echo "[$name] registered"
          fi
        else
          echo "[$name] register failed after unreserve:" >&2
          echo "$reg_out" >&2
          FAILURES+=("$name:register")
          continue
        fi
      else
        echo "[$name] reserved (set AUTO_UNRESERVE_RESERVED=1 to unreserve+register automatically)"
      fi
    elif printf '%s' "$reg_out" | grep -Eiq 'NameUnavailable|already|revert|reverted'; then
      echo "[$name] already unavailable/registered, continuing"
    else
      echo "[$name] register failed:" >&2
      echo "$reg_out" >&2
      FAILURES+=("$name:register")
      continue
    fi
  fi

  echo "[$name] setting CID"
  if ! is_valid_cid "$cid"; then
    echo "[$name] refusing to set invalid CID: $cid" >&2
    FAILURES+=("$name:setCID-invalid-cid")
    continue
  fi
  set +e
  tx_json="$(send_json "setCID(string,string)" "$name" "$cid" 2>&1)"
  tx_code=$?
  set -e
  if [[ $tx_code -ne 0 ]]; then
    echo "[$name] setCID failed:"
    echo "$tx_json"
    FAILURES+=("$name:setCID")
    continue
  fi
  tx_hash="$(printf '%s' "$tx_json" | jq -r '.transactionHash // empty')"
  if [[ -z "$tx_hash" ]]; then
    echo "[$name] failed to parse setCID tx hash" >&2
    echo "$tx_json" >&2
    FAILURES+=("$name:setCID")
    continue
  fi
  echo "[$name] setCID tx: $tx_hash"
  wait_for_tx "$tx_hash" "$name setCID"
done

echo
echo "Done."
for i in "${!NAMES[@]}"; do
  echo "- ${NAMES[$i]}.ipns.io -> ${CIDS[$i]}"
done
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "- $f"
  done
  exit 1
fi
