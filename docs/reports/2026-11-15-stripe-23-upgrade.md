# stripe-node 20 → 23 upgrade (rs-backend)

**Version bump:** `stripe` `^20.4.1` (installed 20.4.1) → `^23.1.0` (installed 23.1.0).
`package.json` + `package-lock.json` updated; CI installs with `npm ci`, so the lockfile must move with it.

## Source files changed
- `package.json`, `package-lock.json` — the bump.
- `src/infrastructure/stripe/stripeClient.ts`
  1. `createPaymentIntent`: `payment_method_types: ['card']` → `allowed_payment_method_types: ['card']`.
     v23 removed `payment_method_types` from `PaymentIntentCreateParams` (Stripe regenerated the
     param name). Still card-only; `DINER_PAYMENT_METHOD_TYPES` is unchanged.
  2. Two `paymentIntents.retrieve(id, { stripeAccount })` calls → `retrieve(id, {}, { stripeAccount })`.
     See the latent-bug note below.
- `test/infrastructure/stripeClient.test.ts` — request-shape expectation updated to
  `allowed_payment_method_types` (same behaviour, new param name).

## Latent bug found (not merely a type change)
`paymentIntents.retrieve` has always been `(id, params?, options?)` — `stripeAccount` is a **request
option**, not a param. Under v20 the old call `retrieve(id, { stripeAccount })` still compiled, but at
runtime it put `stripeAccount` in the params and sent **no `Stripe-Account` header**, so the retrieve ran
against the *platform* account. Verified empirically against the sandbox: retrieving this order's
PaymentIntent without the account header returns `resource_missing` — `No such payment_intent` — while
the same call with `--stripe-account` returns the PI. v23's typings reject the old form
(`TS2353: 'stripeAccount' does not exist in type 'PaymentIntentRetrieveParams'`), which is what surfaced
it. The two affected call sites are the error-path fallbacks in `capturePaymentIntent` and
`releaseAuthorization`; before the fix both would have thrown `resource_missing` instead of recovering.

## Build / unit tests
- `npm run build` — passes (0 tsc errors).
- `npm test` — 178 files / 1666 tests pass, before and after the bump.

## End-to-end verification (dev Stripe sandbox, local host)
Ran the code built from this branch on an isolated port (`7075`) with a `stripe listen` session
forwarding Connect events to it, against the wired dev shop **Ma Pasta**
(`connectOnboardingStatus: complete`, `isPaused: false`):

| Step | Result |
|---|---|
| `POST /api/orders` | 200 — PaymentIntent created; sandbox accepted `allowed_payment_method_types: ['card']` |
| before confirm | `orders`: none; `checkout_sessions`: present (no order exists yet) |
| `stripe payment_intents confirm … --stripe-account` | `amount_capturable: 2100` (manual capture — money reserved) |
| connect webhook `payment_intent.amount_capturable_updated` | local host `[200]`; order `PLACED` → `ACCEPTED`, `payment.status: paid`, invoice `R-2026-00049`; `checkout_sessions` gone |
| refund leg — external refund `re_…` | `refund.created` + `charge.refunded` + `refund.updated` + `charge.refund.updated` all `[200]` locally; order → `REFUNDED`, `payment.status: refunded` |

No errors in the local host log; every forwarded event returned `[200]`.
State was read directly from Cosmos; the local (upgraded) instance is the one that wrote it
(`stripeConnectWebhook … Duration=1697ms` on the local host, with the deployed dev app as the only
other consumer).

**Not exercised:** the two error-path `retrieve` fallbacks (they need a forced Stripe failure). Their
signature is type-verified against the v23 typings and the account-header behaviour was verified
directly with the CLI, as above.

## Notes
- The SDK re-pins its default API version; the app never passes `apiVersion` explicitly, so the
  effective API version changes with the bump. That is the intended change.
- The storefront bump is a separate ticket (`t_18a23f1f`).
