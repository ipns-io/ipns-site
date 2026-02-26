# ipns.io analytics hooks

The current page emits canonical:

- `search_name`
- `check_availability`

For wallet/transaction UX integrations, emit canonical tx events via hooks:

- `window.IPNS_ANALYTICS_HOOKS.registerTxSubmitted({ name, wallet, tx_hash, request_id, operation_id, chain_id, cid })`
- `window.IPNS_ANALYTICS_HOOKS.registerTxConfirmed({ name, wallet, tx_hash, request_id, operation_id, chain_id, cid })`
- `window.IPNS_ANALYTICS_HOOKS.setCidTxSubmitted({ name, cid, wallet, tx_hash, request_id, operation_id, chain_id })`
- `window.IPNS_ANALYTICS_HOOKS.setCidTxConfirmed({ name, cid, wallet, tx_hash, request_id, operation_id, chain_id })`

All payloads include the required common properties exactly:

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
