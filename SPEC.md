# IPNS Resolution Spec v1

Canonical mapping is onchain:

`name -> cid`

Gateways are interchangeable readers of the same public state.

## Canonical State

- Chain: Base (mainnet / sepolia)
- Read method: `resolve(string) -> string`

## Name Normalization

1. Lowercase
2. Trim whitespace
3. Enforce `^[a-z0-9-]{1,20}$`

## Resolution Algorithm

1. `normalize(name)`
2. `cid = contract.resolve(name)`
3. If `cid` is empty: unresolved
4. Fetch `/ipfs/{cid}`
5. Return content + freshness metadata

## Publisher Write Path

```text
if isAvailable(name):
  price = getPrice(name, years)
  register(name, years, value=price)

setCID(name, cid)
assert resolve(name) == cid
```

## Compatibility Requirement

Any gateway implementing this spec against the same contract must resolve identical output for the same `name` at the same chain state.

## References

- Contracts: https://github.com/ipns-io/ipns-contracts
- Gateway: https://github.com/ipns-io/ipns-gateway
- Threat model: https://github.com/ipns-io/ipns-site/blob/main/THREAT_MODEL.md
