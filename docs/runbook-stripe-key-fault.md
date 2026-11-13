# Runbook: Stripe platform key fault — orders held as PLACED

**Symptom.** Orders sit in `PLACED` (not rejected) and logs show `[stripe:failure] op=capture kind=permission_or_config …`; a platform alert fires via `alertOnStripeConfigFailure`. Cause: the platform key (app setting `STRIPE_SECRET_KEY`) is expired, revoked, or lacks a permission. One key serves every shop, so every auto-accept capture is affected.

**What the system does meanwhile.** The capture claim is cleared, the order stays `PLACED` with `captureConfigFailure { at, attempts }`, and the timer retries each minute (auto-accept shops) — staff can also press Accept. Card declines are unaffected: they still reject with `payment_failed`.

**Bounded wait.** At the order's `autoRejectAt` (the shop's `autoRejectMinutes`, max `AUTO_REJECT_MAX_MINUTES`) the timer rejects with reason `payment_unavailable`, releases the authorization (so the card is not held for Stripe's ~7-day reservation), emails the diner a non-blaming message, and does **not** call `recordMissedOrder` — no shop is auto-paused by this fault. If the release itself fails, the existing release-retry (every 15 min) applies.

## Repair
1. Find affected orders: logs with `kind=permission_or_config`; or orders in `PLACED` with `captureConfigFailure` set (Cosmos `orders`, read-only query).
2. In the Stripe dashboard, issue/restore the platform key with the required permissions. Do not paste the key anywhere but the app setting.
3. Update the Function App setting `STRIPE_SECRET_KEY` (name only here; never log or commit the value) and restart the app.
4. Orders still inside their wait window: auto-accept shops are captured by the next minute's timer run with no action. Manual-accept shops: staff accept as normal. A successful accept removes the marker.
5. Orders already past `autoRejectAt` were rejected with `payment_unavailable` and their authorization released; they cannot be accepted. The diner must re-order. They are *not* counted as missed orders.
6. Confirm: new orders capture and reach `ACCEPTED`; no new `kind=permission_or_config` lines.

**Window is short.** With the default 10 minutes, a fault longer than that loses the held orders (without charging). Fix the key quickly, or raise the shop timeout temporarily if appropriate.
