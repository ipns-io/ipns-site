# IPNS Deployment State

Last updated: 2026-02-17
Network: Base Sepolia

## Active Contract
- Address: `0x1bbe8783884c23e1bf02f1221291696798002d8a`
- RPC: `https://sepolia.base.org`

## Worker / Gateway
- Worker: `ipns-gateway` (Cloudflare)
- `CONTRACT_ADDRESS` should be: `0x1bbe8783884c23e1bf02f1221291696798002d8a`
- `BASE_RPC_URL`: `https://sepolia.base.org`
- `APEX_DOMAIN`: `ipns.io`
- `IPFS_GATEWAY_ORIGIN`: `https://ipfs.io/ipfs`

## Demo Namespace (keeps main ipns.io untouched)
- `demo.ipns.io` -> `bafybeidytivalhhxbii6inlj3ifjkj7gr4wogzw6rb7jcavvdf37utsofm`
- `demo-docs.ipns.io` -> `bafybeihy2yzzgx6s5e2w4qxogcguxmcgnut7t5lnzl6sskbcfqbnrvfvee`
- `demo-admin.ipns.io` -> `bafybeifncx57jwp4rfhmydqboid3fcz6wsrh5uwmcrcdtjz5vbqw5ivh6y`
- `demo-app.ipns.io` -> `bafybeib3gyukfhtg623brgafje6sjecrprz7azc5qz2l7b4as32gh3l73u`
- `demo-status.ipns.io` -> `bafybeihwsfyyvl5igaw6fhrllnigsf7qlmhfyditr73gg6ktubdwjquc4q`

## Local Paths
- Demo pages: `/Users/guy3/Documents/guy3/ipns-site/demos`
- Main script: `/Users/guy3/Documents/guy3/ipns-site/scripts/pin-and-point-surfaces.sh`
- Single-name script: `/Users/guy3/Documents/guy3/ipns-site/scripts/repin-and-update-demo.sh`
- Env file: `/Users/guy3/Documents/guy3/ipns-site/.env`

## Daily Use
```bash
cd /Users/guy3/Documents/guy3/ipns-site
set -a
source .env
set +a
./scripts/pin-and-point-surfaces.sh
```

## Verify
```bash
cd /Users/guy3/Documents/guy3/ipns-site
set -a
source .env
set +a
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "demo"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "demo-docs"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "demo-admin"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "demo-app"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "demo-status"
curl -s https://test.ipns.io/healthz
```

## Security
- Old compromised key is deprecated.
- Active owner key is the new safe wallet key stored locally in `.env`.
- Never paste private keys into chat.

## Next Product Task (Pinned)
- Build first-party upload/pinning tool (`ipns upload`) so Pinata is a backend dependency, not a user-facing requirement.
