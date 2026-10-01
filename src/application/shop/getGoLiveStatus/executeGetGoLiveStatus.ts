import { HttpRequest } from '@azure/functions';
import Stripe from 'stripe';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import {
  GetGoLiveStatusRequestDto,
  GetGoLiveStatusResultDto,
  GoLiveCriterion,
} from './dtos';
import { Shop } from '../../../domain/shop/Shop';
import { isOnMenu } from '../../../domain/product/Product';

function buildCriteria(
  shop: Shop,
  hasProducts: boolean,
  hasCategories: boolean,
): GoLiveCriterion[] {
  const addr = shop.address ?? {};
  const addressComplete =
    !!(addr.street?.trim()) &&
    !!(addr.city?.trim()) &&
    !!(addr.state?.trim()) &&
    !!(addr.postcode?.trim()) &&
    !!(addr.country?.trim());

  const hasOpeningHours = Object.values(shop.openingHours ?? {}).some(
    (slots) => Array.isArray(slots) && slots.length > 0,
  );

  return [
    {
      key: 'stripe_connected',
      met: shop.stripe?.connectOnboardingStatus === 'complete',
      description: 'Stripe payments onboarding is complete',
    },
    {
      key: 'has_products',
      met: hasProducts,
      description: 'Shop has at least one available dish with allergens and additives declared',
    },
    {
      key: 'has_categories',
      met: hasCategories,
      description: 'Shop has at least one category',
    },
    {
      key: 'profile_name',
      met: !!(shop.name?.trim()),
      description: 'Shop name is set',
    },
    {
      key: 'profile_address',
      met: addressComplete,
      description: 'Full address is filled in (street, city, state, postcode, country)',
    },
    {
      key: 'profile_logo',
      met: !!(shop.branding?.logoUrl),
      description: 'Shop logo is uploaded',
    },
    {
      key: 'opening_hours',
      met: hasOpeningHours,
      description: 'Opening hours are configured for at least one day',
    },
  ];
}

export async function executeGetGoLiveStatus(
  request: GetGoLiveStatusRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetGoLiveStatusResultDto>> {
  if (!request.shopId || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    let shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    // Sync Stripe Connect status directly — don't rely solely on webhooks
    if (shop.stripe?.connectAccountId) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey) {
        const stripe = new Stripe(stripeSecretKey);
        const stripeAccount = await stripe.accounts.retrieve(shop.stripe.connectAccountId);
        const liveStatus =
          stripeAccount.charges_enabled && stripeAccount.details_submitted
            ? 'complete'
            : stripeAccount.details_submitted
              ? 'pending'
              : 'not_started';
        const statusRank = { not_started: 0, pending: 1, complete: 2 };
        const currentRank = statusRank[shop.stripe.connectOnboardingStatus ?? 'not_started'] ?? 0;
        const liveRank = statusRank[liveStatus] ?? 0;
        if (liveStatus !== shop.stripe.connectOnboardingStatus && liveRank >= currentRank) {
          shop = await updateShop({
            ...shop,
            stripe: { ...shop.stripe, connectOnboardingStatus: liveStatus },
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const [products, categories] = await Promise.all([
      findProductsByShopId(shop.id),
      findCategoriesByShopId(shop.id),
    ]);

    const hasProducts = products.some((p) => isOnMenu(p));
    const hasCategories = categories.some((c) => !c.isDeleted);

    const criteria = buildCriteria(shop, hasProducts, hasCategories);
    const allMet = criteria.every((c) => c.met);

    return { ok: true, data: { allMet, criteria } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to get go-live status' };
  }
}
