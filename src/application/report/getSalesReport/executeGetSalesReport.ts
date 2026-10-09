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

/** Takings, VAT per rate, hours, modes and top dishes of one restaurant for a date range. */
export async function executeGetSalesReport(
  request: { shopId: string; from: unknown; to: unknown },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SalesReport>> {
  try {
    const shop = request.shopId ? await findShopById(request.shopId) : null;
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    const access = await authorizeShopAction(httpRequest, shop, 'view_reports');
    if (!access.ok) return access;
    const range = parseReportRange(request.from, request.to);
    if (range === 'invalid') return { ok: false, code: 'INVALID_INPUT', error: REPORT_RANGE_ERROR };
    const { fromIso, toIso } = utcWindowFor(range.from, range.to);
    const { rows, requestCharge } = await findReportRows(shop.id, fromIso, toIso);
    console.log(
      `[report] shop=${shop.id} from=${range.from} to=${range.to} rows=${rows.length} ru=${requestCharge.toFixed(1)}`,
    );
    return {
      ok: true,
      data: buildSalesReport({ shopId: shop.id, ...range, timezone: shop.timezone, currency: shop.currency, rows }),
    };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load the report' };
  }
}
