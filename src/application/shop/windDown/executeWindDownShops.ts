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
import {
  deleteStaffAccount,
  findAllStaffAccountIdsByShopId,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { deleteBlobsByPrefix, shopBlobPrefix } from '../../../infrastructure/storage/blobStorageHelpers';
import { logAudit } from '../../_shared/auditHelpers';
import { errorBrief } from '../../_shared/errorBrief';

export interface WindDownResult {
  shopsWoundDown: number;
  ordersAnonymised: number;
  productsDeleted: number;
  categoriesDeleted: number;
  /** Staff accounts hard-deleted (username + password hash): erasure, not anonymisation. */
  staffAccountsDeleted: number;
  /** Image blobs deleted from Blob Storage: product media, cover and logo. */
  imagesDeleted: number;
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
 *   3. deletes the shop's image blobs from Blob Storage (product media, cover and logo) under the
 *      `shops/{shopId}/` prefix — the Cosmos documents going is not "menu deleted" without them;
 *   4. hard-deletes every staff account (usernames and password hashes) — the only shop-scoped
 *      personal data left, so it is erased, not anonymised;
 *   5. hard-deletes the shop document (the storefront) — last, and only if nothing failed and the
 *      shop was not changed (e.g. restored) since it was read, so a failed run is retried tomorrow.
 *
 * Invoice snapshots are a separate container and are never read or written here. Promotions,
 * `shop_subscriptions` and `shop_usage` are commercial records and are deliberately left alone.
 * Idempotent: the shop document is the cursor, and anonymised orders are filtered out per row.
 * Writes one log line per deleted thing. Never throws for a single shop's failure.
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
    staffAccountsDeleted: 0,
    imagesDeleted: 0,
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

      // Images live in Blob Storage, not Cosmos. One sweep of the shop's own prefix removes the
      // product media and the cover/logo, orphans included, and stops the storage billing. The
      // whole prefix belongs to this shop alone, so nothing that must be kept is under it.
      try {
        const imagesDeleted = await deleteBlobsByPrefix(shopBlobPrefix(shopId));
        result.imagesDeleted += imagesDeleted;
        if (imagesDeleted > 0) {
          console.log(`[windDown] action=images.delete shopId=${shopId} deleted=${imagesDeleted}`);
        }
      } catch (err) {
        shopFailures++;
        console.error(`[windDown:error] action=images.delete shopId=${shopId}`, errorBrief(err));
      }

      // Staff logins are the only shop-scoped personal data the wind-down leaves behind: erase
      // them, do not anonymise. Soft-deleted rows are included (deleteStaff keeps them renamed).
      for (const staffId of await findAllStaffAccountIdsByShopId(shopId)) {
        try {
          await deleteTolerantOfGone(() => deleteStaffAccount(staffId, shopId));
          result.staffAccountsDeleted++;
          console.log(`[windDown] action=staff.delete shopId=${shopId} staffId=${staffId}`);
        } catch (err) {
          shopFailures++;
          console.error(`[windDown:error] action=staff.delete shopId=${shopId} staffId=${staffId}`, errorBrief(err));
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
