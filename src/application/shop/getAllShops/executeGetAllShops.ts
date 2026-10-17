import { missedOrdersPauseLimitOf, ordersPauseFieldsOf } from '../../../domain/shop/ordersPause';
import { isShopOffline } from '../../../domain/shop/Shop';
import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findAllShopsIncludingDeleted } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { GetAllShopsRequestDto, GetAllShopsResultDto, ShopSummaryDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetAllShops(
  _request: GetAllShopsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetAllShopsResultDto>> {
  try {
    // Superadmin only: the list includes deleted shops, so it must not be public.
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const shops = await findAllShopsIncludingDeleted();

    const shopDtos: ShopSummaryDto[] = shops.map((shop) => ({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      isDeleted: shop.isDeleted,
      deletedAt: shop.deletedAt,
      isPaused: shop.isPaused,
      pausedMessage: shop.pausedMessage,
      ...ordersPauseFieldsOf(shop, new Date()),
      missedOrdersPauseLimit: missedOrdersPauseLimitOf(shop),
      ordersPausedMessage: shop.ordersPausedMessage,
      isOffline: isShopOffline(shop),
      offlineBySuperadmin: shop.offlineBySuperadmin === true,
      offlineBySuperadminReason: shop.offlineBySuperadminReason,
      orderAcceptanceMode: shop.orderAcceptanceMode,
      currency: shop.currency,
      timezone: shop.timezone,
      minOrderAmountCents: shop.minOrderAmountCents,
      address: shop.address,
      openingHours: shop.openingHours,
      closures: shop.closures,
      branding: shop.branding ?? null,
      pendingNameChange: shop.pendingNameChange ?? null,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    }));

    const resultDto: GetAllShopsResultDto = {
      shops: shopDtos,
      total: shopDtos.length,
    };

    return {
      ok: true,
      data: resultDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve shops',
    };
  }
}
