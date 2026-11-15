# Prod alerts — webhook non-2xx and Stripe credential failure (task t_eb35113c)

Run 2026-11-15, read-only against Azure (`c115d7d2-…`). Nothing was created or changed in Azure.
Builds on packet D4 (branch `wt/d4-alerts-for-order-intake-an`, commit `9348120`).

PR #35 (the D4 scaffolding) is now **merged** (`1520cda`), so this branch was rebuilt on the current `main`
(`d8ecc45`) and carries no D4 file beyond the runbook-pointer fix below.

## Rebuild after the D4 merge

`main` moved mid-card. The branch as it stood produced `CONFLICT (add/add)` on `infra/alerts/README.md` and the
four D4 payloads against the new `main`. The rebuild takes `main`'s D4 files as-is (plus the dead-`runbook`-pointer
fix) and adds only this card's two payloads, the README rows and the §20 bullet. PR #35 needs no further action.

The rule queries were re-validated after the rebuild, on 2026-11-15, against the dev component
(`restaurant-ordering-system-dev`, role literal swapped to `-dev`): webhook query — 1 row in P7D (a real HTTP 400
POST to `/api/webhooks/stripe`, `2026-11-09T13:20:19Z`); Stripe query with its role filter — accepted, 0 rows in P30D.

## Change

- `infra/alerts/alert-prod-webhook-non2xx.json` and `alert-prod-stripe-credential-failure.json` —
  ARM payloads (the PUT body verbatim), same shape as D4's, severity 1, `PT5M`/`PT5M`, count `> 0`,
  prod scope and action group `ag-restaurant-prod-webhooks`, `cloud_RoleName == 'restaurant-ordering-system'`
  (both prod rules filter on it; dev's `alert-stripe-credential-failure` still does not).
- `infra/alerts/README.md` — two table rows and a line that these rules are defined but not in Azure.
- `docs/specs.md` §20 — "Monitoring alerts" bullet (rule set, apply command, `cloud_RoleName`, action group).
- No `.ts`, test or build input changed; `npm test` not run. D4's rule definitions (query, scope,
  severity, threshold) and `apply-alerts.sh` are untouched — only their `customProperties.runbook`
  string was repointed at `docs/specs.md`.

Rationale for the Stripe rule: `kind=permission_or_config` is emitted only on the money paths
(`src/infrastructure/stripe/stripeErrorDiagnostics.ts`), so this is the out-of-band copy of the in-app
platform alert for when `PLATFORM_ALERT_EMAIL` is unset.

## Acceptance — per rule

| Rule | In Azure | Evidence |
|---|---|---|
| `alert-prod-webhook-non2xx` | **no** (prod RG does not exist) | JSON valid; `prod --dry-run` prints URL + summary; query accepted by the dev component with only the role literal swapped to `-dev` — **1 row in P7D**: a real HTTP `400` POST to `/api/webhooks/stripe` (`2026-11-09T13:20:19Z`) |
| `alert-prod-stripe-credential-failure` | **no** | same, with the role filter in place — query accepted, **0 rows in P30D** |

## Decisions

- **Severity 1 in prod** (dev is 2): a prod webhook or credential fault means orders are being lost.
- **No duplicate dev webhook rule**: `alert-dev-webhook-non2xx` and `alert-stripe-credential-failure`
  already exist in dev; the prod ones are only definitions.
- **Runbook pointer** is `docs/specs.md` in all six payloads: `docs/prod-runbook.md` was deleted in the
  docs-consolidation commit, so D4's four `customProperties.runbook` values were repointed too (a
  metadata string only — no rule query, scope or threshold was touched).
- **Role filter on the prod Stripe rule** — both prod rules filter
  `cloud_RoleName == 'restaurant-ordering-system'` (dev's Stripe rule does not). Prod must equal the app
  name or the rule can never fire (§20); a component-scoped rule also sees local `func start` telemetry,
  whose role name is empty. The prod rule is deliberately stricter than dev.
- **Canonical Stripe-rule form** — the prod rule matches `[stripe:failure] … kind=permission_or_config`
  (with the role filter), NOT the `alert-prod-stripe-config-failure` / `[alert:platform]
  kind=stripe_permission_or_config` form sketched in the deleted runbook §12, which is superseded.
  `alertOnStripeConfigFailure` is called from exactly one place, the capture catch in
  `src/application/order/_shared/acceptPlacedOrder.ts`; the shared Stripe failure logger emits
  `[stripe:failure]` on every money-path Stripe failure it logs (capture, refunds, checkout, document
  generation). Both lines are written on a capture permission failure, so the `[stripe:failure]` matcher
  is the broader signal.

## Deviation to note

`apply-alerts.sh prod --verify` does not print NOT PRESENT per rule: it stops first, exit 1, because
the action group is missing ("STOP: action group 'ag-restaurant-prod-webhooks' not found…"). Same
outcome (non-zero, nothing present), different message. Script behaviour left unchanged as instructed.

## Unverified

- Prod was never read: the resource group does not exist, so no prod resource, action group or
  `cloud_RoleName` value was observed. That `restaurant-ordering-system` is the real prod role name is
  taken from the brief.
- No alert was seen to fire. "Query parses + 0 rows" (run against the **dev** component with only the
  role-name literal for the webhook rule swapped to the prod value) is not a firing test. The
  role-filtered Stripe query **was** run against the dev component (accepted, 0 rows in P30D), but "query parses
  + 0 rows" is a definition check, not a firing test.
- The payloads have not been PUT to ARM, so ARM acceptance of them is unproven.
