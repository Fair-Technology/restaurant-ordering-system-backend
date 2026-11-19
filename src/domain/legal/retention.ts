import { Order } from '../order/Order';

/**
 * SPECS §15 "Retention and erasure" — the automatic retention clean-up of a diner's delivery address.
 *
 * A delivery address is personal data that an issued invoice never carries (`Order.ts`: the delivery
 * address is "never on the invoice"), so it may be blanked once the order is old enough that no
 * dispute can still call it up — far sooner than the order row itself, which the restaurant keeps for
 * its tax records. The billing address (`customerAddress`) is deliberately NOT in scope: it feeds the
 * invoice buyer snapshot (`invoice.ts`) and is removed by erasure only.
 *
 * This window is narrower than `anonymiseOrder` (domain/legal/erasure.ts): it clears the delivery
 * address and nothing else, and it must never write `anonymisedAt`.
 */
export const DELIVERY_ADDRESS_RETENTION_DAYS_SETTING = 'DELIVERY_ADDRESS_RETENTION_DAYS';

/**
 * Days after an order is placed before its delivery address is blanked. 180 is the CONFIRMED default
 * (owner, 2026-11-19) — the card-network dispute window of 120 days plus a resolution tail; it
 * lives behind a setting so a future change needs no code change.
 */
export const DEFAULT_DELIVERY_ADDRESS_RETENTION_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The configured retention window in days, or the confirmed default when unset or unreadable. */
export function deliveryAddressRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[DELIVERY_ADDRESS_RETENTION_DAYS_SETTING];
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_DELIVERY_ADDRESS_RETENTION_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) return DEFAULT_DELIVERY_ADDRESS_RETENTION_DAYS;
  return days;
}

/**
 * True once a delivery order is past its retention window. Anchored on `createdAt` — the moment the
 * diner supplied the address. Fails safe: an order with no delivery address to blank, or an
 * unreadable `createdAt`, is never due. There is no marker field: blanking an already-blank address
 * is a no-op, so the operation is idempotent by construction.
 */
export function isDeliveryAddressExpired(
  order: Pick<Order, 'deliveryAddress' | 'createdAt'>,
  now: Date,
  retentionDays: number,
): boolean {
  if (!order.deliveryAddress) return false;
  const createdMs = Date.parse(order.createdAt);
  if (Number.isNaN(createdMs)) return false;
  return now.getTime() - createdMs >= retentionDays * DAY_MS;
}

/**
 * Blanks the delivery address and nothing else.
 *
 * Deliberately NOT `anonymiseOrder`: that eraser strips the whole person (name, email, phone, notes,
 * access token, billing address) and sets `anonymisedAt`. This window must leave every one of those
 * fields byte-identical. `anonymisedAt` in particular is never written — it is documented as "set
 * only by customer erasure" and is the skip-guard for both erasure and a shop's GDPR export, so
 * setting it here would silently hide the row from both. No `updatedAt` bump either, so the persisted
 * row differs from the original only by the removed field and a second run is provably a no-op.
 */
export function blankDeliveryAddress(o: Order): Order {
  const { deliveryAddress: _blanked, ...rest } = o;
  return rest;
}
