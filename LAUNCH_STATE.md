# LAUNCH_STATE

Last updated: 2026-02-17

## Live Landing State (confirmed)
- Network: Base Sepolia
- Contract: `0x1bbe8783884c23e1bf02f1221291696798002d8a`
- Name: `www`
- Live CID (green landing): `bafybeiaxgyorvwqglaz3w42l7cj6tcsc3pz3woq4sfyhlbxuwnrd46oram`

## Expected behavior
- `https://www.ipns.io/` redirects to `https://ipns.io/`
- `https://ipns.io/` serves the green landing page above
- Gateway health endpoint is available at `https://test.ipns.io/healthz`

## Verify (copy/paste)
```bash
source /Users/guy3/Documents/guy3/ipns-site/.env

cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
curl -sI "https://ipns.io/?v=$(date +%s)" | grep -iE "x-ipfs-path|location|cache-control"
curl -sI "https://www.ipns.io/?v=$(date +%s)" | grep -iE "x-ipfs-path|location|cache-control"
```

You should see:
- `resolve("www")` => `bafybeiaxgyorvwqglaz3w42l7cj6tcsc3pz3woq4sfyhlbxuwnrd46oram`
- `ipns.io` response header includes:
  - `x-ipfs-path: /ipfs/bafybeiaxgyorvwqglaz3w42l7cj6tcsc3pz3woq4sfyhlbxuwnrd46oram/index.html`

## Re-point `www` to current green CID
```bash
source /Users/guy3/Documents/guy3/ipns-site/.env

cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
  "$CONTRACT" "setCID(string,string)" "www" "bafybeiaxgyorvwqglaz3w42l7cj6tcsc3pz3woq4sfyhlbxuwnrd46oram"

cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
```

## If browser still shows stale page
1. Hard refresh (Cmd+Shift+R)
2. Open with cache-buster: `https://ipns.io/?v=<timestamp>`
3. Purge Cloudflare cache for:
   - `https://ipns.io/*`
   - `https://www.ipns.io/*`

## Cloudflare routing requirements
Keep all of these Worker routes active:
- `ipns.io/*`
- `www.ipns.io/*`
- `*.ipns.io/*`

## Notes
- Do not commit secrets from `.env`.
- If content changes, new CID must contain `/index.html` at root (or gateway will return not found/upstream errors).

## TODO
- Demo namespace consistency pass: use a fresh deploy wallet, then re-run `setCID` for `demo`, `demo-docs`, `demo-admin`, `demo-app`, and `demo-status` so onchain resolved CIDs exactly match the latest pinned HTML.
