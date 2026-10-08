import { orderableModesFor } from '../../../domain/order/fulfilment';
import { effectivePrepByMode } from '../../../domain/order/kitchenTiming';
import { orderSettingsOf } from '../../../domain/order/orderSettings';
import { findShopBySlug } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { GetShopBySlugRequestDto, GetShopBySlugResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { loadOrderLimitStatus } from '../../usage/orderLimitStatus';

export async function executeGetShopBySlug(
  request: GetShopBySlugRequestDto,
  options: { now?: Date } = {},
): Promise<ApplicationResult<GetShopBySlugResultDto>> {
  // Validate input
  if (
    !request.slug ||
    typeof request.slug !== 'string' ||
    request.slug.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'slug is required and must be a non-empty string',
    };
  }

  try {
    const now = options.now ?? new Date();
    const shop = await findShopBySlug(request.slug.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    let orderLimitReached = false;
    try {
      orderLimitReached = (await loadOrderLimitStatus(shop, now)).limitReached;
    } catch {
      console.error('[order-limit:error] shop page', shop.id);
    }

    const modes = orderableModesFor(shop);
    const shopDto: GetShopBySlugResultDto = {
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
      countryCode: shop.countryCode,
      fulfilment: {
        modes,
        prepMinutes: effectivePrepByMode(shop, now),
        delivery: modes.includes('delivery') ? { zones: orderSettingsOf(shop).deliveryZones } : null,
      },
      orderLimitReached,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };

    return {
      ok: true,
      data: shopDto,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve shop',
    };
  }
}
