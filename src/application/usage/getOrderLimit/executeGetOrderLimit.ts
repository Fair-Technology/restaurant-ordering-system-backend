import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { OrderLimitStatus } from '../../../domain/usage/orderLimit';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { loadEntitlements } from '../../_shared/entitlements';
import { loadOrderLimitStatus } from '../orderLimitStatus';

export interface OrderLimitWithPaymentDto extends OrderLimitStatus {
  payment: { inGrace: boolean; graceEndsAt: string | null; droppedForNonPayment: boolean };
}

export async function executeGetOrderLimit(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<OrderLimitWithPaymentDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, null, { allowSuperadmin: true });
    if (!access.ok) return access;

    const now = new Date();
    const [status, ent] = await Promise.all([loadOrderLimitStatus(shop, now), loadEntitlements(shop.id, now)]);
    const payment = {
      inGrace: !!ent.graceEndsAt && !ent.droppedForNonPayment,
      graceEndsAt: ent.graceEndsAt,
      droppedForNonPayment: ent.droppedForNonPayment,
    };
    return { ok: true, data: { ...status, payment } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load the order limit' };
  }
}
