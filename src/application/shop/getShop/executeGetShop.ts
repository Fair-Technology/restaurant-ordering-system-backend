import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authenticate } from '../../../infrastructure/auth/principal';
import { realDeps, resolveShopAccess } from '../../_shared/shopAccess';
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
    const principal = await authenticate(httpRequest);

    const shop = await findShopById(request.shopId.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    if (principal.kind === 'staff' && principal.shopId !== shop.id) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: 'You do not have access to this restaurant',
      };
    }

    const access = await resolveShopAccess(principal, shop, realDeps, { allowSuperadmin: true });

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
      callerRole: access ? (access.actor.role ?? 'superadmin') : null,
      callerPermissions: access?.permissions ?? [],
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
