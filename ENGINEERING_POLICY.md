# Engineering Policy

This policy keeps `ipns-site` releasable and safe while launch surfaces are changing quickly.

## Commit and Push Rules

- Changes only go remote after intentional `git add`, `git commit`, and `git push`.
- Keep commits focused and small.
- Never commit secrets, wallet keys, or `.env` files.

## Branching Rules

- Keep `main` production-releasable.
- Use feature branches for active work.
- Open PRs for non-trivial changes.

## Test Policy (3 Layers)

1. Unit:
- UI logic checks for checkout/top-up states where possible.

2. Integration:
- Build/publish scripts run without errors.
- Name resolution and routing wiring validated.

3. E2E Smoke:
- `www.ipns.io` returns expected content.
- `docs.ipns.io`, `admin.ipns.io`, and other key subdomains resolve.
- Checkout flow smoke pass (including low-balance top-up path).

## Publish Safety

- Cache-bust during validation (`?v=<timestamp>`).
- Verify gateway headers (`x-ipfs-path`) on production checks.
- Do not publish placeholder/null CIDs.

## Pre-Merge Checklist

- 3-layer validation completed (or exception documented)
- No secrets in diff
- Launch docs updated if behavior changed
- Rollback plan for risky publish changes
