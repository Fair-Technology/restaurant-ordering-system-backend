import { findShopBySlug } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { GetShopBySlugRequestDto, GetShopBySlugResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetShopBySlug(
  request: GetShopBySlugRequestDto,
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
    const shop = await findShopBySlug(request.slug.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    const shopDto: GetShopBySlugResultDto = {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      isDeleted: shop.isDeleted,
      isPaused: shop.isPaused,
      pausedMessage: shop.pausedMessage,
      paymentPolicy: shop.paymentPolicy,
      orderAcceptanceMode: shop.orderAcceptanceMode,
      currency: shop.currency,
      timezone: shop.timezone,
      minOrderAmountCents: shop.minOrderAmountCents,
      address: shop.address,
      openingHours: shop.openingHours,
      closures: shop.closures,
      members: shop.members,
      branding: shop.branding ?? null,
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
