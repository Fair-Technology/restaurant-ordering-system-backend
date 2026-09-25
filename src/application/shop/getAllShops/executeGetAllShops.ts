import { findAllShops } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { GetAllShopsRequestDto, GetAllShopsResultDto, ShopSummaryDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetAllShops(
  _request: GetAllShopsRequestDto,
): Promise<ApplicationResult<GetAllShopsResultDto>> {
  try {
    const shops = await findAllShops();

    const shopDtos: ShopSummaryDto[] = shops.map((shop) => ({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      isDeleted: shop.isDeleted,
      isPaused: shop.isPaused,
      pausedMessage: shop.pausedMessage,
      isDeactivatedDueToLimits: shop.isDeactivatedDueToLimits ?? false,
      paymentPolicy: shop.paymentPolicy,
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
  } catch {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve shops',
    };
  }
}
