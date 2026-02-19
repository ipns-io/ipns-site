# IPNS + CID.RUN Launch Checklist

## 0) Load env once per shell
```bash
cd /Users/guy3/Documents/guy3/ipns-site
source .env
```

## 1) Update www.ipns.io from local index
```bash
cd /Users/guy3/Documents/guy3/ipns-site
source .env
mkdir -p /tmp/ipns-www-live
cp /Users/guy3/Documents/guy3/ipns-site/index.html /tmp/ipns-www-live/index.html
WWW_CID=$(curl -s https://api.pinata.cloud/pinning/pinFileToIPFS -H "Authorization: Bearer $PINATA_JWT" -F "file=@/tmp/ipns-www-live/index.html;filename=index.html" -F 'pinataOptions={"cidVersion":1,"wrapWithDirectory":true}' | jq -r '.IpfsHash')
echo "$WWW_CID"
cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$CONTRACT" "setCID(string,string)" "www" "$WWW_CID"
cast call --rpc-url "$RPC_URL" "$CONTRACT" "resolve(string)(string)" "www"
curl -sI "https://www.ipns.io/?v=$(date +%s)" | grep -i x-ipfs-path
```

## 2) Update cid.run landing from local cidrun index
```bash
cd /Users/guy3/Documents/guy3/ipns-site
source .env
mkdir -p /tmp/cidrun-live
cp /Users/guy3/Documents/guy3/ipns-site/cidrun/index.html /tmp/cidrun-live/index.html
CIDRUN_CID=$(curl -s https://api.pinata.cloud/pinning/pinFileToIPFS -H "Authorization: Bearer $PINATA_JWT" -F "file=@/tmp/cidrun-live/index.html;filename=index.html" -F 'pinataOptions={"cidVersion":1,"wrapWithDirectory":true}' | jq -r '.IpfsHash')
echo "$CIDRUN_CID"
curl -s "https://ipfs.io/ipfs/$CIDRUN_CID/index.html" | grep -E "Register once, resolve on any compatible gateway|\\.cid\\.run"
```

Set Cloudflare Worker variable after step 2:
- Worker: `cidrun-gateway`
- Variable: `LANDING_CID`
- Value: output from `$CIDRUN_CID`

## 3) Verify all live endpoints
```bash
curl -I https://ipns.io/
curl -I https://www.ipns.io/
curl -I https://cid.run/
curl -I https://www.cid.run/
curl -I https://yourname.cid.run/
```

Expected:
- `https://ipns.io/` returns `301` to `https://www.ipns.io/`
- `https://www.ipns.io/` returns Cloudflare headers
- `https://cid.run/` returns Cloudflare headers and `x-ipfs-path`
- `https://www.cid.run/` returns Cloudflare headers and `x-ipfs-path`
- `https://yourname.cid.run/` returns `404` until that name is registered

## 4) One-shot pass/fail check
```bash
for h in cid.run www.cid.run yourname.cid.run; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://$h/")
  server=$(curl -sI "https://$h/" | awk -F': ' 'tolower($1)=="server"{print $2}' | tr -d '\r')
  ipfs=$(curl -sI "https://$h/" | awk -F': ' 'tolower($1)=="x-ipfs-path"{print $2}' | tr -d '\r')
  if [ "$h" = "yourname.cid.run" ]; then
    if [ "$code" = "404" ] && [ "$server" = "cloudflare" ]; then
      echo "PASS $h  $code  $server  (expected unresolved name)"
    else
      echo "FAIL $h  $code  $server"
    fi
  else
    if [ "$code" = "200" ] && [ "$server" = "cloudflare" ] && [ -n "$ipfs" ]; then
      echo "PASS $h  $code  $server  $ipfs"
    else
      echo "FAIL $h  $code  $server  ipfs_path=${ipfs:-none}"
    fi
  fi
done
```

## 5) If local cache is stale
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
dig +short A cid.run
curl -I https://cid.run/
```
