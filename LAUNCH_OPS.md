# IPNS Launch Ops Runbook

## 1) Critical Links
- Main site: `https://www.ipns.io`
- Docs: `https://docs.ipns.io`
- Whitepaper: `https://whitepaper.ipns.io`
- Spec: `https://spec.ipns.io`
- CID gateway: `https://www.cid.run`

## 2) Critical Addresses
- Sepolia contract (current): `0x1bbE8783884C23e1bf02F1221291696798002d8a`
- Treasury Safe (Base mainnet): `0x30f20a0705068Cbe832bd60cDa8A39f9f9f665B7`
- Coupon signer / hot signer (current): `0x27b7EefCc8745b6Ff444cc4e39c6646a8Fd88db2`
- Deployer (current): `0x33ad6b22a087A33841e8adc5B4f2f44ba844378c`
- Base chain ID: `8453`

Update after mainnet deploy:
- Mainnet contract: `TODO_MAINNET_CONTRACT`

## 2.1) Incident Contacts / Escalation
- Primary operator: `TODO_NAME`
- Backup operator: `TODO_NAME`
- Safe co-signer(s): `TODO_NAMES`
- Escalation order:
  1. Pause writes (if active incident)
  2. Roll back `www` / landing CIDs
  3. Investigate + patch
  4. Unpause after verification

## 3) Cloudflare Workers
- `ipns-gateway`
  - Must set `CONTRACT_ADDRESS` to active contract
  - Must set `APEX_DOMAIN=ipns.io`
- `cidrun-gateway`
  - Must set `CONTRACT_ADDRESS` to active contract
  - Must set `APEX_DOMAIN=cid.run`
  - Must set `LANDING_CID` to latest `cidrun` landing folder CID

## 3.1) Worker Runtime Snapshot (fill before launch)
- `ipns-gateway`
  - `CONTRACT_ADDRESS=TODO`
  - `BASE_RPC_URL=TODO`
  - `APEX_DOMAIN=ipns.io`
  - `LANDING_CID=TODO`
- `cidrun-gateway`
  - `CONTRACT_ADDRESS=TODO`
  - `BASE_RPC_URL=TODO`
  - `APEX_DOMAIN=cid.run`
  - `LANDING_CID=TODO`

## 4) Minimum Pre-Launch Checks
Run from `/Users/guy3/Documents/guy3/ipns-site`:

```bash
source .env
cast chain-id --rpc-url "$RPC_URL"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
curl -I https://www.ipns.io/
curl -I https://www.ipns.io/favicon.ico
curl -I https://www.cid.run/
curl -I https://www.cid.run/favicon.ico
```

Expected:
- Chain ID `8453` for Base mainnet endpoints
- `resolve("www")` returns non-empty CID
- All curl checks return `200`

## 5) Emergency Actions
### A) Pause contract writes (owner only)
Use when registration/update behavior is wrong:

```bash
cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$CONTRACT" "pause()"
```

### B) Unpause contract writes (owner only)
After fix verification:

```bash
cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$CONTRACT" "unpause()"
```

### C) Fast website rollback (`www`)
If site breaks, repoint `www` to last known-good CID:

```bash
GOOD_CID="REPLACE_WITH_LAST_GOOD_WWW_CID"
cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit 300000 \
  "$CONTRACT" "setCID(string,string)" "www" "$GOOD_CID"
```

### D) Verify rollback
```bash
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
curl -I https://www.ipns.io/
```

## 6) CID Safety Rule (Do Not Skip)
Never write `setCID` unless:
1. CID is non-empty and not `"null"`.
2. `https://ipfs.io/ipfs/<CID>/index.html` returns `200`.
3. For sites with favicon: `https://ipfs.io/ipfs/<CID>/favicon.ico` returns `200`.

## 7) Name Registration Budget (Current Plan)
Planned names:
- `g`, `g2`, `guy`, `guy2`, `guy3`, `ella`, `lily`, `katie`, `korbyn`, `joe`

Current annual estimate (contract tier pricing): **$117/year** + gas.

## 8) Where to Store Sensitive Data
Store these in password manager (1Password/Bitwarden), not in plaintext docs:
- `PRIVATE_KEY`
- `PINATA_JWT`
- Cloudflare API token(s)
- GitHub PAT(s)
- RPC provider credentials (if any)
- Safe signing wallet recovery material references

Do **not** store raw secrets in this markdown file or commit them to git.

## 8.1) Secret Reference Map (safe to store here)
Use labels/paths only, no secret values:
- `PRIVATE_KEY` location: `TODO_PASSWORD_MANAGER_PATH`
- `PINATA_JWT` location: `TODO_PASSWORD_MANAGER_PATH`
- Cloudflare token location: `TODO_PASSWORD_MANAGER_PATH`
- GitHub PAT location: `TODO_PASSWORD_MANAGER_PATH`
- RPC key location: `TODO_PASSWORD_MANAGER_PATH`
- Ledger seed backup location (offline): `TODO_PHYSICAL_LOCATION`
- Safe URL: `TODO_SAFE_URL`

Keep this file for operational runbook only.

## 9) Launch-Day Command Order (High Level)
1. Final favicon/content pin checks on IPFS
2. Point `www` CID
3. Point `cid.run` landing CID in worker
4. Confirm both sites + favicon return `200`
5. Deploy/confirm mainnet contract (paused)
6. Update workers to mainnet contract
7. Smoke test register/resolve
8. Register launch names
9. Unpause when green

## 10) Post-Launch Monitoring Quick Commands
```bash
curl -sI https://www.ipns.io/ | grep -iE "HTTP/|x-ipfs-path"
curl -sI https://www.cid.run/ | grep -iE "HTTP/|x-ipfs-path"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "docs"
```

## 11) Last-Known-Good CIDs (fill and maintain)
- `www` => `bafybeiatao7fqhxogfw6uflx32a7isydaagzevwdfph7tikmfhrc35nxba`
- `docs` => `TODO`
- `whitepaper` => `TODO`
- `spec` => `TODO`
- `cid.run landing` => `TODO`
