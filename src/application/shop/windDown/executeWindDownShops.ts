import type { AuditActorType } from '../../../domain/audit/AuditEntry';
import { anonymiseOrder } from '../../../domain/legal/erasure';
import { isDueForWindDown, WIND_DOWN_RETENTION_DAYS } from '../../../domain/shop/windDown';
import {
  deleteShopIfMatch,
  findDeletedShops,
  findShopWithEtag,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findOrdersByShopId, replaceOrder } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { deleteProduct, findAllProductIdsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import {
  deleteCategory,
  findAllCategoryIdsByShopId,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { errorBrief } from '../../_shared/errorBrief';

export interface WindDownResult {
  shopsWoundDown: number;
  ordersAnonymised: number;
  productsDeleted: number;
  categoriesDeleted: number;
  /** Rows that failed this run; the shop is left in place so the next run retries it. */
  failures: number;
}

export interface WindDownInput {
  now: Date;
  /** Restrict the run to these shops (the injected-clock route). Omitted: every deleted shop. */
  onlyShopIds?: string[];
  /** Who triggered it, for the audit log. Defaults to the daily timer. */
  actor?: { actorType: AuditActorType; actorId: string };
}

const SYSTEM_ACTOR = { actorType: 'system' as const, actorId: 'shopWindDown' };

/** Cosmos 404 on a delete means a parallel run got there first: the state we want. */
async function deleteTolerantOfGone(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err: any) {
    if (err?.code !== 404) throw err;
  }
}

/**
 * The 90-day wind-down of restaurants that left (SPECS §15 "Retention and erasure", §10).
 *
 * For every soft-deleted shop whose `deletedAt` is at least 90 days before `now`:
 *   1. anonymises every order not yet anonymised — one row at a time, whatever its state. Unlike a
 *      customer erasure there is no all-or-nothing refusal: one open order never blocks the rest;
 *   2. hard-deletes every product and category (the menu), soft-deleted ones included;
 *   3. hard-deletes the shop document (the storefront) — last, and only if nothing failed and the
 *      shop was not changed (e.g. restored) since it was read, so a failed run is retried tomorrow.
 *
 * Invoice snapshots are a separate container and are never read or written here.
 * Idempotent: the shop document is the cursor, and anonymised orders are filtered out per row.
 * Writes one log line per action. Never throws for a single shop's failure.
 */
export async function executeWindDownShops(input: WindDownInput): Promise<WindDownResult> {
  const { now } = input;
  const nowIso = now.toISOString();
  const actor = input.actor ?? SYSTEM_ACTOR;
  const result: WindDownResult = {
    shopsWoundDown: 0,
    ordersAnonymised: 0,
    productsDeleted: 0,
    categoriesDeleted: 0,
    failures: 0,
  };

  const only = input.onlyShopIds ? new Set(input.onlyShopIds) : null;
  const candidates = (await findDeletedShops()).filter(
    (s) => (!only || only.has(s.id)) && isDueForWindDown(s, now),
  );

  for (const candidate of candidates) {
    const shopId = candidate.id;
    let shopFailures = 0;
    try {
      // Re-read: the list may be stale, and a restore in between must win.
      const current = await findShopWithEtag(shopId);
      if (!current || !isDueForWindDown(current.shop, now)) continue;

      const orders = (await findOrdersByShopId(shopId)).filter((o) => !o.anonymisedAt);
      for (const o of orders) {
        try {
          await replaceOrder(anonymiseOrder(o, nowIso));
          result.ordersAnonymised++;
          console.log(`[windDown] action=order.anonymise shopId=${shopId} orderId=${o.id} state=${o.state}`);
        } catch (err) {
          shopFailures++;
          console.error(`[windDown:error] action=order.anonymise shopId=${shopId} orderId=${o.id}`, errorBrief(err));
        }
      }

      for (const productId of await findAllProductIdsByShopId(shopId)) {
        try {
          await deleteTolerantOfGone(() => deleteProduct(productId, shopId));
          result.productsDeleted++;
          console.log(`[windDown] action=product.delete shopId=${shopId} productId=${productId}`);
        } catch (err) {
          shopFailures++;
          console.error(`[windDown:error] action=product.delete shopId=${shopId} productId=${productId}`, errorBrief(err));
        }
      }

      for (const categoryId of await findAllCategoryIdsByShopId(shopId)) {
        try {
          await deleteTolerantOfGone(() => deleteCategory(categoryId, shopId));
          result.categoriesDeleted++;
          console.log(`[windDown] action=category.delete shopId=${shopId} categoryId=${categoryId}`);
        } catch (err) {
          shopFailures++;
          console.error(`[windDown:error] action=category.delete shopId=${shopId} categoryId=${categoryId}`, errorBrief(err));
        }
      }

      if (shopFailures > 0) {
        result.failures += shopFailures;
        console.error(`[windDown:error] action=shop.delete shopId=${shopId} skipped=true failures=${shopFailures}`);
        continue;
      }

      const deleted = await deleteShopIfMatch(shopId, current.etag);
      if (deleted === 'conflict') {
        // Changed since we read it (restored?). Leave it; the next run decides again.
        console.warn(`[windDown] action=shop.delete shopId=${shopId} skipped=true reason=changed`);
        continue;
      }
      result.shopsWoundDown++;
      console.log(`[windDown] action=shop.delete shopId=${shopId} deletedAt=${current.shop.deletedAt}`);

      // Permanent record. No personal data: counts only.
      await logAudit({
        shopId,
        ...actor,
        action: 'shop.windDown',
        entityType: 'shop',
        entityId: shopId,
        entityName: `${current.shop.name}: wound down ${WIND_DOWN_RETENTION_DAYS} days after deletion`,
      });
    } catch (err) {
      result.failures += shopFailures + 1;
      console.error(`[windDown:error] shopId=${shopId}`, errorBrief(err));
    }
  }

  return result;
}
