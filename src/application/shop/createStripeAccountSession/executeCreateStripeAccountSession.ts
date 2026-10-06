import { HttpRequest } from '@azure/functions';
import Stripe from 'stripe';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { stripeAccountCreateParams } from '../../../domain/shop/Shop';
import { registerStorefrontDomain } from '../_shared/registerStorefrontDomain';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import {
  CreateStripeAccountSessionRequestDto,
  CreateStripeAccountSessionResultDto,
} from './dtos';

export async function executeCreateStripeAccountSession(
  request: CreateStripeAccountSessionRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateStripeAccountSessionResultDto>> {
  if (!request.shopId || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' };
  }

  try {
    let shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_billing');
    if (!access.ok) return access;

    const stripe = new Stripe(stripeSecretKey);

    // Create a Connect account if one does not exist yet
    if (!shop.stripe?.connectAccountId) {
      const account = await stripe.accounts.create(stripeAccountCreateParams(shop));
      shop = await updateShop({
        ...shop,
        stripe: { ...shop.stripe, connectAccountId: account.id, connectOnboardingStatus: 'pending' },
        updatedAt: new Date().toISOString(),
      });
    }

    // Sync the live Stripe account status — catches cases where the webhook
    // wasn't received (e.g. local dev without the CLI running)
    const stripeAccount = await stripe.accounts.retrieve(shop.stripe!.connectAccountId!);
    const liveStatus =
      stripeAccount.charges_enabled && stripeAccount.details_submitted
        ? 'complete'
        : stripeAccount.details_submitted
          ? 'pending'
          : 'not_started';
    const statusRank = { not_started: 0, pending: 1, complete: 2 };
    const currentRank = statusRank[shop.stripe!.connectOnboardingStatus ?? 'not_started'] ?? 0;
    const liveRank = statusRank[liveStatus] ?? 0;
    if (liveStatus !== shop.stripe!.connectOnboardingStatus && liveRank >= currentRank) {
      shop = await updateShop({
        ...shop,
        stripe: { ...shop.stripe, connectOnboardingStatus: liveStatus },
        updatedAt: new Date().toISOString(),
      });
    }

    // Apple Pay / Google Pay need the storefront domain on the restaurant's account (once; no-op if present).
    await registerStorefrontDomain(shop.stripe!.connectAccountId!);

    // Pick the right Stripe component based on purpose
    const purpose = request.purpose ?? 'onboarding';
    const components =
      purpose === 'management'
        ? { account_management: { enabled: true } as const }
        : { account_onboarding: { enabled: true } as const };

    // Always create a fresh AccountSession (they are short-lived)
    const accountSession = await stripe.accountSessions.create({
      account: shop.stripe!.connectAccountId!,
      components,
    });

    return { ok: true, data: { clientSecret: accountSession.client_secret } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to create Stripe account session',
    };
  }
}
