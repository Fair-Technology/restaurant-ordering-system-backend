import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findAllShops } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findOrdersForRejectionStats } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { REJECTION_WINDOW_DAYS, rejectionStats } from '../../../domain/usage/rejectionStats';
import { ApplicationResult } from '../../_shared/types';
import { loadOrderLimitStatus } from '../orderLimitStatus';
import { RejectionWatchDto, RejectionWatchRowDto } from './dtos';

export async function executeGetRejectionWatch(httpRequest: HttpRequest): Promise<ApplicationResult<RejectionWatchDto>> {
  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const now = new Date();
    const since = new Date(now.getTime() - REJECTION_WINDOW_DAYS * 86_400_000).toISOString();
    const shops = (await findAllShops()).filter((s) => !s.isDeleted);
    const rows: RejectionWatchRowDto[] = await Promise.all(
      shops.map(async (shop) => {
        const orderLimit = await loadOrderLimitStatus(shop, now);
        const orders = await findOrdersForRejectionStats(shop.id, since);
        return {
          shopId: shop.id,
          name: shop.name,
          slug: shop.slug,
          orderLimit,
          rejections: rejectionStats(orders, now, orderLimit.warningLevel),
        };
      }),
    );

    rows.sort(
      (a, b) =>
        Number(b.rejections.flags.length > 0) - Number(a.rejections.flags.length > 0) ||
        (b.rejections.rate ?? -1) - (a.rejections.rate ?? -1) ||
        a.name.localeCompare(b.name),
    );
    return { ok: true, data: { shops: rows } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load the decline watch' };
  }
}
