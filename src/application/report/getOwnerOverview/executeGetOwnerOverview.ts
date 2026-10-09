import type { HttpRequest } from '@azure/functions';
import type { ApplicationResult } from '../../_shared/types';
import { loadOrderLimitStatus } from '../../usage/orderLimitStatus';
import { localDate } from '../../../domain/order/orderTimers';
import { buildSalesReport, utcWindowFor } from '../../../domain/report/salesReport';
import type { Shop } from '../../../domain/shop/Shop';
import type { OrderLimitStatus } from '../../../domain/usage/orderLimit';
import { authenticate } from '../../../infrastructure/auth/principal';
import { countWaitingOrders, findReportRows } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findOwnedShopIds, findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';

export const MAX_OVERVIEW_SHOPS = 25;
export const OVERVIEW_OWNERS_ONLY_ERROR = 'Only restaurant owners have an overview';

export interface OwnerOverviewShop {
  shopId: string;
  name: string;
  slug: string;
  isPaused: boolean;
  currency: string;
  timezone: string;
  today: { date: string; orderCount: number; takingsCents: number };
  waitingCount: number;
  /** Per restaurant; limits never pool, so there is no summed field. */
  orderLimit: OrderLimitStatus;
}

export interface OwnerOverview {
  generatedAt: string;
  shops: OwnerOverviewShop[];
  /** More than MAX_OVERVIEW_SHOPS owned. */
  truncated: boolean;
  /** Null when currencies differ or there are no shops. */
  combinedToday: { currency: string; orderCount: number; takingsCents: number } | null;
}

/** Today's takings, waiting orders and order limit for every restaurant the caller owns. */
export async function executeGetOwnerOverview(
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OwnerOverview>> {
  try {
    const now = options.now ?? new Date();
    const principal = await authenticate(httpRequest);
    if (principal.kind !== 'entra') return { ok: false, code: 'FORBIDDEN', error: OVERVIEW_OWNERS_ONLY_ERROR };
    const ids = await findOwnedShopIds(principal.userId);
    const loaded = (await Promise.all(ids.map((id) => findShopById(id))))
      .filter((s): s is Shop => !!s && !s.isDeleted)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const shown = loaded.slice(0, MAX_OVERVIEW_SHOPS);
    const shops = await Promise.all(
      shown.map(async (shop): Promise<OwnerOverviewShop> => {
        const date = localDate(now, shop.timezone);
        const { fromIso, toIso } = utcWindowFor(date, date);
        const [{ rows }, waitingCount, orderLimit] = await Promise.all([
          findReportRows(shop.id, fromIso, toIso),
          countWaitingOrders(shop.id),
          loadOrderLimitStatus(shop, now),
        ]);
        const t = buildSalesReport({
          shopId: shop.id,
          from: date,
          to: date,
          timezone: shop.timezone,
          currency: shop.currency,
          rows,
        }).totals;
        return {
          shopId: shop.id,
          name: shop.name,
          slug: shop.slug,
          isPaused: shop.isPaused,
          currency: shop.currency,
          timezone: shop.timezone,
          today: { date, orderCount: t.orderCount, takingsCents: t.takingsCents },
          waitingCount,
          orderLimit,
        };
      }),
    );
    const currencies = new Set(shops.map((s) => s.currency));
    const combinedToday =
      shops.length > 0 && currencies.size === 1
        ? {
            currency: shops[0].currency,
            orderCount: shops.reduce((n, s) => n + s.today.orderCount, 0),
            takingsCents: shops.reduce((n, s) => n + s.today.takingsCents, 0),
          }
        : null;
    return {
      ok: true,
      data: { generatedAt: now.toISOString(), shops, truncated: loaded.length > MAX_OVERVIEW_SHOPS, combinedToday },
    };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load the overview' };
  }
}
