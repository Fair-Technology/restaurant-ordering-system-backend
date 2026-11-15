# t_eedc1e2a: automatic retention clean-up of diner delivery addresses

- Branch: `kanban/t_eedc1e2a`, based on `main` @ `62110f4`
- Not merged: hand-off is to @tester for verification against the acceptance criteria.

## What was built

The scheduled job that blanks an order's delivery address once its retention window passes — and
nothing else. `DELIVERY_ADDRESS_RETENTION_DAYS` (default **180**, *provisional pending owner
confirmation*) is read from the environment; the number is never hard-coded in the job.

| File | Change |
|---|---|
| `src/domain/legal/retention.ts` | `deliveryAddressRetentionDays(env)` (setting, default 180, fails safe to the default on blank/unreadable values); `isDeliveryAddressExpired(order, now, days)` anchored on `createdAt`, fails safe on a missing address or unreadable date; `blankDeliveryAddress(o)` — a narrow function that removes **only** `deliveryAddress`, never bumps `updatedAt`, never writes `anonymisedAt`. |
| `src/application/legal/retention/runRetention.ts` | `run_retention(now)`: pure over its injected clock. Queries delivery orders at/before the cutoff, re-reads each under its etag (so a concurrent erasure wins), and writes the blanked copy only if unchanged. One log line per blanked row; never throws for a single row. |
| `src/application/legal/retention/executeRunRetentionWithClock.ts` | Superadmin-only auth + input checks, then `runRetention` with the supplied clock (optional `shopId` scopes the run). |
| `src/functions/legal/deliveryAddressRetentionTimer/index.ts` | `app.timer('deliveryAddressRetention', { schedule: '0 45 3 * * *' })` — daily 03:45 UTC, `{ now: new Date() }`. |
| `src/functions/legal/runRetentionWithClock/index.ts` | `POST /api/platform/test-clock/retention/delivery-addresses`, body `{ "now": "<ISO>", "shopId"?: "<id>" }`. Registered only when `ENABLE_TEST_CLOCK_ROUTES=true`; otherwise it is absent (404). |
| `src/infrastructure/cosmos/order/CosmosOrderRepository.ts` | `findOrdersWithDeliveryAddressCreatedBefore(cutoffIso)` — one single-partition-cross query (`IS_DEFINED(c.deliveryAddress) AND c.createdAt <= @cutoff`). |
| `src/index.ts` | Registers the timer and the (self-gating) route. |
| `scripts/generate-openapi.js` | `runRetentionWithClock: { skip: true }` — the spec ships in the same artifact and must not reveal a route that does not exist in production. |
| `infra/main.bicep` | App setting `DELIVERY_ADDRESS_RETENTION_DAYS = '180'` (provisional). |
| `local.settings.json` (gitignored) | `AzureWebJobs.deliveryAddressRetention.Disabled = "true"`, matching the other timers. |
| `test/domain/retention.test.ts` | 6 tests: the setting default/override/fail-safe, the window boundary, and the narrow blank. |
| `test/application/legal/runRetention.test.ts` | 12 tests: the acceptance criteria (AC4–AC9), the boundary, the erasure race, scoping, per-row failure and retry. |
| `test/application/legal/retentionRegression.test.ts` | 1 named sequential test (below). |
| `test/functions/deliveryAddressRetention.test.ts` | 16 tests: the timer wiring and the four route verdicts (production 404 ×8, identical 404 with/without a token, dev 401, dev 403 ×3, dev 200, dev 200 scoped, dev 400). |

Full suite: **193 files / 1770 tests pass**; `npm run build` (openapi + tsc) is clean, and the
regenerated `swagger.json` is byte-identical.

## Design notes

- **No marker field.** An absent delivery address is simply not a candidate, so the sweep is
  idempotent by construction. `anonymisedAt` is never written: it is documented as "set only by
  customer erasure" and is the skip-guard for both erasure and the shop export. Writing it would
  hide the row from both.
- **Not `anonymiseOrder`.** That eraser strips the whole person; this window clears one field.
- **Billing address untouched.** `customerAddress` feeds the invoice buyer snapshot; it is removed
  by erasure only. `deliveryAddress` is never on an invoice, so an issued invoice cannot be affected
  by construction — AC9 reads the persisted invoice document by id before and after a run.
- **Erasure is not overridden.** The candidate query skips rows with no address, and each write is
  guarded by the etag from a fresh read, so a row erased between the query and the write is left
  alone rather than resurrected.

## Deviation to flag for the tester

The card's *sequential regression suite* lists, in order: `blank → anonymisedAt unset → run erasure
→ name/email/phone erased → run shop export → assert the customer is present`. That order is
unsatisfiable: `deriveCustomers` skips a row on `o.anonymisedAt || email === ''`, and erasure sets
both, so after an erasure the customer is absent from the export by design. The suite is
implemented to assert the same intent in a consistent order:

1. blank → `anonymisedAt` unset (and personal fields intact);
2. shop export **before any erasure** → the customer **is present** (the check the non-empty seed
   email protects — a blank email would make it half vacuous via the same guard);
3. erasure → name/email/phone **are** erased;
4. shop export **after the erasure** → the customer is **absent** (the correct behaviour).

## Not done

- `AGENTS.md` was **not** updated: the write is blocked by the agent-instruction-file guard in this
  environment. The one factual bullet that belongs there is: *delivery-address retention — a daily
  job blanks `deliveryAddress` past `DELIVERY_ADDRESS_RETENTION_DAYS` (default 180, provisional);
  it never writes `anonymisedAt` and never touches the billing `customerAddress`.*
- No live call against the shared dev database was made: it would blank real dev orders' delivery
  addresses. The route tests exercise the injected-clock path without that side effect.
