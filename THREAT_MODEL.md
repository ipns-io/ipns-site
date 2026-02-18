# IPNS.io Threat Model (v1)

## Scope

System in scope:

- Onchain registry contract on Base Sepolia/Mainnet (`name -> CID`, ownership, registration)
- Gateway resolution layer (`*.ipns.io`, `*.cid.run` style frontends)
- DNS + TLS edge (Cloudflare)
- Publish/update operator workflows (scripts, keys, CI)

Out of scope for v1:

- Offchain indexers as canonical state (contract is canonical)
- Browser wallet UX phishing outside first-party surfaces

## Security Goals

1. Only legitimate name owner can change CID.
2. Name resolution is deterministic from onchain state.
3. Gateway/DNS outages do not permanently break namespace.
4. Operational mistakes do not leak keys or corrupt name mappings.
5. Users can assess trust assumptions clearly.

## Trust Assumptions (Current)

- Contract is canonical source of truth.
- Gateway operators read from trusted RPC endpoints.
- DNS/TLS for `ipns.io` and related domains are managed correctly.
- Owner/admin keys are not compromised.

## Threat Register

### TM-01: Name sniping / mempool front-running
- Surface: `register(name, years)` transaction.
- Likelihood: Medium.
- Impact: High (loss of desired names, trust damage).
- Current controls:
  - First-come register semantics.
  - Reserved names list (where used).
- Gaps:
  - No commit-reveal flow.
- Mitigations:
  - Add commit-reveal registration option.
  - Add short-lived signed reservation tickets for launch events.
- Owner: Protocol.
- Priority: P1.

### TM-02: Authorization bug in contract
- Surface: owner checks on `setCID`, transfer, renewal, reserve operations.
- Likelihood: Low-Medium.
- Impact: Critical.
- Current controls:
  - Minimal contract design.
  - Existing tests.
- Gaps:
  - Need explicit invariant/property checks for all write paths.
- Mitigations:
  - Add invariant tests: non-owner cannot mutate any name state.
  - Add fuzz tests around name normalization + ownership transitions.
  - Commission focused external review before mainnet marketing push.
- Owner: Protocol.
- Priority: P0.

### TM-03: Admin key compromise / upgrade abuse
- Surface: privileged functions or deployment pipeline.
- Likelihood: Medium.
- Impact: Critical.
- Current controls:
  - Single operator practices.
- Gaps:
  - No mandatory multisig/timelock policy captured.
- Mitigations:
  - Move privileged control to multisig.
  - Publish admin action policy + emergency process.
  - Add timelock for sensitive parameter changes where possible.
- Owner: Ops.
- Priority: P0.

### TM-04: Gateway stale cache / inconsistent resolution
- Surface: CDN, gateway cache, client cache.
- Likelihood: High.
- Impact: Medium-High.
- Current controls:
  - Low cache TTL on gateway responses.
  - Cache bust testing (`?v=`).
- Gaps:
  - No explicit consistency SLA or verification endpoint.
- Mitigations:
  - Add `/resolve/<name>` JSON endpoint with `{cid, block, txHash}`.
  - Return explicit cache headers and freshness metadata.
  - Document expected propagation windows.
- Owner: Gateway.
- Priority: P1.

### TM-05: RPC dependency outage / degradation
- Surface: gateway resolution calls to RPC.
- Likelihood: High (observed on Sepolia).
- Impact: High (resolution failures/timeouts).
- Current controls:
  - Manual RPC switching.
- Gaps:
  - No automatic multi-RPC failover.
- Mitigations:
  - Implement weighted multi-RPC pool + health checks.
  - Add timeout + retry + circuit breaker.
  - Emit provider-level error metrics.
- Owner: Gateway.
- Priority: P0.

### TM-06: DNS/TLS takeover risk
- Surface: domain registrar, DNS panel, TLS issuance.
- Likelihood: Low-Medium.
- Impact: High.
- Current controls:
  - Cloudflare-managed edge.
- Gaps:
  - Domain remains load-bearing for mainstream users.
- Mitigations:
  - Harden registrar account + 2FA + lock.
  - Publish resolver spec + third-party gateway compatibility.
  - Add non-DNS access paths (ENS + independent gateways).
- Owner: Ops + Protocol.
- Priority: P1.

### TM-07: Name squatting / phishing confusables
- Surface: registration economics and string policy.
- Likelihood: High.
- Impact: Medium-High.
- Current controls:
  - Pricing tiers by length.
  - Optional reserved names.
- Gaps:
  - Limited anti-phishing normalization policy.
- Mitigations:
  - Restrict charset to lowercase a-z, 0-9, hyphen.
  - Maintain denylist for high-risk impersonation patterns.
  - Add warning labels in app UI for risky names.
- Owner: Protocol + App.
- Priority: P1.

### TM-08: User key loss / irreversible ownership loss
- Surface: self-custodial owner wallets.
- Likelihood: Medium.
- Impact: High for affected users.
- Current controls:
  - None (self-custody assumption).
- Gaps:
  - No recovery path.
- Mitigations:
  - Explicitly document no-recovery model now.
  - Evaluate optional opt-in recovery mechanism later with strict constraints.
- Owner: Product.
- Priority: P2.

### TM-09: Deployment pipeline secret leakage
- Surface: local scripts, `.env`, git history, CI logs.
- Likelihood: Medium.
- Impact: Critical.
- Current controls:
  - `.env*` now gitignored in site repo.
- Gaps:
  - Historical repos may still contain sensitive artifacts.
- Mitigations:
  - Run secret scan pre-push on all repos.
  - Rotate keys if ever committed.
  - Use scoped API keys and least privilege.
- Owner: Ops.
- Priority: P0.

## Prioritized Action Plan (Next 14 Days)

### P0 (must-do)
1. Multi-RPC failover in gateway resolver path.
2. Contract auth/invariant test pass + independent review scheduling.
3. Multisig/admin-key hardening policy documented and enforced.
4. Secret hygiene audit across all public repos.

### P1 (should-do)
1. Resolver spec v1 publication (`/spec`, versioned).
2. Gateway proof/diagnostic endpoint (`resolved CID + source block`).
3. String normalization + anti-phishing policy docs.
4. DNS hardening checklist and backup operator process.

### P2 (later)
1. Commit-reveal registration upgrade path.
2. Optional recovery model research.
3. External gateway conformance test suite.

## Monitoring & Detection

Track at minimum:

- Resolver success/error rate by RPC provider.
- Mean/95p resolution latency.
- CID mismatch incidents (resolved vs expected).
- Unauthorized write attempt patterns.
- DNS/TLS configuration changes.

## Incident Response (Minimum)

1. Detect + classify (`contract`, `gateway`, `dns`, `ops`).
2. Freeze risky writes if needed.
3. Fallback to healthy RPC/gateway path.
4. Publish status update with timestamp and scope.
5. Postmortem with remediation owner and due date.

## Review Cadence

- Weekly during active launch window.
- Monthly after stabilization.
- Immediate update after any security-relevant architecture change.

