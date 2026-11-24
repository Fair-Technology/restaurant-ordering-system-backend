import type { HttpRequest } from '@azure/functions';
import type { ApplicationResult } from '../../_shared/types';
import { authorizeShopAction } from '../../_shared/shopAccess';
import {
  buildSalesReport,
  parseReportRange,
  REPORT_RANGE_ERROR,
  utcWindowFor,
  type SalesReport,
} from '../../../domain/report/salesReport';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findReportRows } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { localize, menuLanguagesOf, resolveMenuLanguage } from '../../../domain/menu/menuLanguage';
import type { Product } from '../../../domain/product/Product';
import { logServiceFailure } from '../../_shared/logServiceFailure';

/** Takings, VAT per rate, hours, modes and top dishes of one restaurant for a date range. */
export async function executeGetSalesReport(
  request: { shopId: string; from: unknown; to: unknown; lang?: unknown },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SalesReport>> {
  try {
    const shop = request.shopId ? await findShopById(request.shopId) : null;
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    const access = await authorizeShopAction(httpRequest, shop, 'view_reports', { allowPlatformRead: true });
    if (!access.ok) return access;
    const range = parseReportRange(request.from, request.to);
    if (range === 'invalid') return { ok: false, code: 'INVALID_INPUT', error: REPORT_RANGE_ERROR };
    const { fromIso, toIso } = utcWindowFor(range.from, range.to);
    const { rows, requestCharge } = await findReportRows(shop.id, fromIso, toIso);
    console.log(
      `[report] shop=${shop.id} from=${range.from} to=${range.to} rows=${rows.length} ru=${requestCharge.toFixed(1)}`,
    );
    const data = buildSalesReport({ shopId: shop.id, ...range, timezone: shop.timezone, currency: shop.currency, rows });
    if (data.topDishes.length > 0) {
      // Show each dish under its current catalog name in the requested language; the order snapshot is only the fallback for a deleted dish/combo.
      const productsById = new Map<string, Product>((await findProductsByShopId(shop.id)).map((p) => [p.id, p]));
      const offered = menuLanguagesOf(shop);
      const lang = resolveMenuLanguage(typeof request.lang === 'string' ? request.lang : null, offered);
      data.topDishes = data.topDishes.map((d) => {
        const product = productsById.get(d.productId);
        if (!product || product.isDeleted) return d;
        return { ...d, name: localize(product.name, product.nameTranslations, lang, offered[0]) };
      });
    }
    return { ok: true, data };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getSalesReport', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load the report' };
  }
}
