import { errorBrief } from '../../_shared/errorBrief';
import {
  blankDeliveryAddress,
  deliveryAddressRetentionDays,
  isDeliveryAddressExpired,
} from '../../../domain/legal/retention';
import {
  findOrderWithEtag,
  findOrdersWithDeliveryAddressCreatedBefore,
  replaceOrderIfMatch,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';

export interface RetentionResult {
  /** Orders whose delivery address was blanked this run. */
  blanked: number;
  /** Delivery orders at or before the cutoff that were examined. */
  examined: number;
  /** Rows that failed this run; the next run retries them. */
  failures: number;
  /** The window in days this run used (from DELIVERY_ADDRESS_RETENTION_DAYS). */
  retentionDays: number;
}

export interface RetentionInput {
  now: Date;
  /** Restrict the run to these shops (the injected-clock route). Omitted: every shop. */
  onlyShopIds?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `run_retention(now)` — the daily retention clean-up (SPECS §15).
 *
 * Blanks the delivery address of every order past its retention window and nothing else. Pure over
 * its injected clock: it never reads `new Date()`, so the timer passes the real clock and the
 * injected-clock route passes a chosen one. The window length comes from
 * `DELIVERY_ADDRESS_RETENTION_DAYS` (default 180, provisional) and is never hard-coded here.
 *
 * Idempotent by construction: a blanked (absent) delivery address is no longer a candidate, so a
 * second run finds nothing to do. No marker field is written and `anonymisedAt` is never set — it
 * belongs to customer erasure alone and guards both erasure and the shop export.
 *
 * Invoice snapshots are a separate container and are never read or written here; the billing
 * `customerAddress` on the order row is untouched, and `deliveryAddress` is never on an invoice.
 * Writes one log line per blanked row and never throws for a single row's failure.
 */
export async function runRetention(input: RetentionInput): Promise<RetentionResult> {
  const { now } = input;
  const retentionDays = deliveryAddressRetentionDays();
  const cutoffIso = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
  const only = input.onlyShopIds ? new Set(input.onlyShopIds) : null;

  const candidates = (await findOrdersWithDeliveryAddressCreatedBefore(cutoffIso)).filter(
    (o) => (!only || only.has(o.shopId)) && isDeliveryAddressExpired(o, now, retentionDays),
  );

  const result: RetentionResult = {
    blanked: 0,
    examined: candidates.length,
    failures: 0,
    retentionDays,
  };

  for (const candidate of candidates) {
    try {
      // Re-read under the etag so a change since the query wins — e.g. a customer erasure that
      // already cleared the address. We never write a stale copy back, which would resurrect it.
      const current = await findOrderWithEtag(candidate.id);
      if (!current || !isDeliveryAddressExpired(current.order, now, retentionDays)) continue;

      const written = await replaceOrderIfMatch(blankDeliveryAddress(current.order), current.etag);
      if (written === 'conflict') {
        console.warn(
          `[retention] action=deliveryAddress.blank orderId=${candidate.id} skipped=true reason=changed`,
        );
        continue;
      }
      result.blanked++;
      console.log(`[retention] action=deliveryAddress.blank shopId=${candidate.shopId} orderId=${candidate.id}`);
    } catch (err) {
      result.failures++;
      console.error(`[retention:error] action=deliveryAddress.blank orderId=${candidate.id}`, errorBrief(err));
    }
  }

  return result;
}
