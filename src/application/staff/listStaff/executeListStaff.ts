import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { listStaffAccounts } from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { getPlanLimitForShop } from '../../_shared/planLimits';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { toDto } from '../_shared';
import { ListStaffRequestDto, ListStaffResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeListStaff(
  request: ListStaffRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ListStaffResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_staff');
    if (!access.ok) return access;

    const now = new Date();
    const list = await listStaffAccounts(shop.id);
    const limit = await getPlanLimitForShop(shop.id, PLAN_LIMIT_KEYS.STAFF_ACCOUNTS);
    const activeCount = list.filter((a) => a.isActive).length;

    return {
      ok: true,
      data: { staff: list.map((a) => toDto(a, now)), limit, activeCount },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve staff logins' };
  }
}
