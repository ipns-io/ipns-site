#!/usr/bin/env bash
set -euo pipefail

bad=0
for h in www docs admin app status; do
  body="$(curl -s "https://$h.ipns.io/?v=$(date +%s)")"
  if echo "$body" | grep -Eq 'demo(-docs|-admin|-app|-status)?\.ipns\.io'; then
    echo "FAIL $h.ipns.io contains demo links"
    bad=1
  else
    echo "PASS $h.ipns.io has no demo links"
  fi
done

if [[ $bad -ne 0 ]]; then
  exit 1
fi
