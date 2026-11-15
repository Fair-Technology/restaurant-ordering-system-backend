# stripe-node 20 → 23 upgrade (rs-backend)

**Version bump:** `stripe` `^20.4.1` (installed 20.4.1) → `^23.1.0`. `package-lock.json` regenerated.

## Source files changed
- `package.json`, `package-lock.json` — the bump.
- `src/infrastructure/stripe/stripeClient.ts`
  - `createPaymentIntent`: `payment_method_types: ['card']` → `allowed_payment_method_types: ['card']`. v23 removed `payment_method_types` from `PaymentIntentCreateParams` (Stripe changelog; replaced by `allowed_payment_method_types`). Still card-only (`DINER_PAYMENT_METHOD_TYPES` unchanged).
  - Two `paymentIntents.retrieve(id, { stripeAccount })` calls → `retrieve(id, {}, { stripeAccount })`. `stripeAccount` is a request option, not a param; v23 types reject it as a param (it previously slipped through). Without this change the Connect account header would not be sent.
- `test/infrastructure/stripeClient.test.ts` — expectation updated to `allowed_payment_method_types` (the request shape the code now sends; behaviour is the same).

## Breaking-change checklist
- `constructEventWithoutVerification` (static): not used. 
- `ErrorType` export: not used.
- `V2List`: not used.
- `StripeConnectionError` vs `StripeAPIError`: `isRetryableStripeError` and `stripeErrorDiagnostics` treat both as transient, so the v23 change (incomplete bodies now ConnectionError) is harmless.
- Webhook `constructEvent` calls compiled unchanged.

## Results
- `npm run build`: passes (0 tsc errors).
- `npm test`: 178 files / 1666 tests passed, before and after.

## Not resolved / to verify by maintainer
- Default API version is re-pinned by the SDK; the live end-to-end payment flow (esp. `allowed_payment_method_types` on a direct charge with manual capture, and the retrieve-with-Connect-account paths) was not exercised — unit tests mock the SDK.
- The `payment_method_types` response field on PaymentIntent still exists in types; nothing in src reads it.
