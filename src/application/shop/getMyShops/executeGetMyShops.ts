import { HttpRequest } from '@azure/functions';
import { findShopsByMemberId } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { GetMyShopsRequestDto, GetMyShopsResultDto, ShopSummaryDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetMyShops(
  request: GetMyShopsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetMyShopsResultDto>> {
  try {
    const userId = await getUserIdFromAuth(httpRequest);

    const shops = await findShopsByMemberId(userId);

    const shopDtos: ShopSummaryDto[] = shops.map((shop) => ({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      isDeleted: shop.isDeleted,
      isPaused: shop.isPaused,
      pausedMessage: shop.pausedMessage,
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

    return { ok: true, data: { shops: shopDtos, total: shopDtos.length } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve shops' };
  }
}
