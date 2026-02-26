# cid.run analytics hooks

Client-side resolve context is limited on the registration page, so canonical resolve signals include:

- automatic `resolve_fail` on RPC/availability failure paths
- explicit hook points for resolver/gateway integrations

Hook API:

- `window.CIDRUN_ANALYTICS_HOOKS.resolveSuccess({ name, cid, request_id, operation_id, wallet, tx_hash, chain_id })`
- `window.CIDRUN_ANALYTICS_HOOKS.resolveFail({ name, request_id, operation_id, wallet, tx_hash, chain_id })`

All emitted payloads include required common properties:

- `event_id`
- `timestamp`
- `surface`
- `env`
- `session_id`
- `wallet`
- `name`
- `cid`
- `tx_hash`
- `chain_id`
- `request_id`
- `operation_id`
