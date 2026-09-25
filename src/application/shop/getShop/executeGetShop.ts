import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { GetShopRequestDto, GetShopResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetShop(
  request: GetShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopResultDto>> {
  // Validate input
  if (
    !request.shopId ||
    typeof request.shopId !== 'string' ||
    request.shopId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  try {
    await getUserIdFromAuth(httpRequest);

    const shop = await findShopById(request.shopId.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    const shopDto: GetShopResultDto = {
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
      members: shop.members,
      countryCode: shop.countryCode ?? '',
      taxRates: shop.taxRates ?? [],
      branding: shop.branding ?? null,
      pendingNameChange: shop.pendingNameChange ?? null,
      stripe: shop.stripe
        ? {
            connectAccountId: shop.stripe.connectAccountId ?? null,
            connectOnboardingStatus: shop.stripe.connectOnboardingStatus ?? null,
          }
        : null,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };

    return {
      ok: true,
      data: shopDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve shop',
    };
  }
}
