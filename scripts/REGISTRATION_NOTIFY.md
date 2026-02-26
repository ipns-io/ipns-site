# Registration Notify + Analytics Verification

This package watches onchain `NameRegistered` events on Base and notifies Discord/Slack exactly once per event using dedupe key `txHash + logIndex`.

## Runtime

Run watcher + HTTP endpoints:

- `node scripts/registration-notifier.mjs`

Endpoints exposed by notifier process:

- `GET /health`
- `GET /registrations/recent?limit=50` (returns recent registrations, capped at 50)
- `POST /analytics/register_tx_confirmed` (ingest frontend analytics evidence)
- `GET /registrations/reconciliation?hours=24` (onchain vs analytics counts + mismatch)

Generate daily reconciliation report JSON:

- `node scripts/registration-reconcile.mjs`

Controlled local verification:

- `node scripts/test-registration-notify.mjs`

## Required env vars

- `BASE_RPC_URL` (default `https://mainnet.base.org`)
- `CONTRACT_ADDRESS` (default `0x1bbE8783884C23e1bf02F1221291696798002d8a`)
- `TOPIC_REGISTER` (default NameRegistered topic)
- `DEPLOY_BLOCK` (default `42383643`)
- `REG_NOTIFY_STATE_PATH` (default `scripts/state/registration-events.json`)
- `REG_NOTIFY_POLL_MS` (default `15000`)
- `REG_NOTIFY_PORT` (default `8788`)
- `ANALYTICS_SHARED_SECRET` (required in production: `POST /analytics/register_tx_confirmed` must include header `x-analytics-secret`)

At least one webhook should be set for notifications:

- `DISCORD_WEBHOOK_URL`
- `SLACK_WEBHOOK_URL`

## Frontend analytics event

On tx confirmation, frontend emits:

- event name: `register_tx_confirmed`
- payload fields: `{ name, owner, txHash }`

If `window.IPNS_ANALYTICS_ENDPOINT` is defined, the same payload is sent via beacon/fetch to support reconciliation.

## Runbook commands

1. Start notifier:

- `export BASE_RPC_URL=https://mainnet.base.org`
- `export CONTRACT_ADDRESS=0x1bbE8783884C23e1bf02F1221291696798002d8a`
- `export DEPLOY_BLOCK=42383643`
- `export REG_NOTIFY_STATE_PATH=scripts/state/registration-events.json`
- `export REG_NOTIFY_POLL_MS=15000`
- `export REG_NOTIFY_PORT=8788`
- `export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`
- `export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...`
- `export ANALYTICS_SHARED_SECRET=replace-with-strong-secret`
- `node scripts/registration-notifier.mjs`

2. Record one analytics confirmation event:

- `curl -sS -X POST http://127.0.0.1:8788/analytics/register_tx_confirmed -H 'content-type: application/json' -H 'x-analytics-secret: replace-with-strong-secret' -d '{\"name\":\"alice\",\"owner\":\"0x1234567890abcdef1234567890abcdef12345678\",\"txHash\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}'`

3. Verify unauthorized request is blocked:

- `curl -sS -i -X POST http://127.0.0.1:8788/analytics/register_tx_confirmed -H 'content-type: application/json' -d '{\"name\":\"alice\",\"owner\":\"0x1234567890abcdef1234567890abcdef12345678\",\"txHash\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}'`

4. Read recent events and 24h reconciliation:

- `curl -sS http://127.0.0.1:8788/registrations/recent?limit=50`
- `curl -sS http://127.0.0.1:8788/registrations/reconciliation?hours=24`
- `node scripts/registration-reconcile.mjs`

5. Controlled local test (dedupe + restart persistence + analytics evidence):

- `node scripts/test-registration-notify.mjs`
