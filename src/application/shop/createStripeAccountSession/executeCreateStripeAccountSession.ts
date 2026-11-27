import { HttpRequest } from '@azure/functions';
import { createStripeClient, publicShopUrl } from '../../../infrastructure/stripe/stripeClient';
import { isUnrestrictedLiveStripeKey } from '../../../infrastructure/stripe/restrictedKey';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { stripeAccountCreateIdempotencyKey, stripeAccountCreateParams } from '../../../domain/shop/Shop';
import { registerStorefrontDomain } from '../_shared/registerStorefrontDomain';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import {
  CreateStripeAccountSessionRequestDto,
  CreateStripeAccountSessionResultDto,
} from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeCreateStripeAccountSession(
  request: CreateStripeAccountSessionRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateStripeAccountSessionResultDto>> {
  if (!request.shopId || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('[service:failure] site=createStripeAccountSession cause=STRIPE_SECRET_KEY is not set');
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' };
  }
  if (isUnrestrictedLiveStripeKey(stripeSecretKey)) {
    console.error('[service:failure] site=createStripeAccountSession cause=STRIPE_SECRET_KEY is an unrestricted live key');
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Stripe is configured with an unrestricted live key; a restricted live key (rk_live_… ) is required',
    };
  }

  try {
    let shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_billing');
    if (!access.ok) return access;

    const stripe = createStripeClient(stripeSecretKey);

    // Create a Connect account if one does not exist yet
    if (!shop.stripe?.connectAccountId) {
      // Idempotency key: two concurrent calls for the same shop must not create two accounts.
      const account = await stripe.accounts.create(stripeAccountCreateParams(shop, publicShopUrl(shop)), {
        idempotencyKey: stripeAccountCreateIdempotencyKey(shop),
      });
      shop = await updateShop({
        ...shop,
        stripe: { ...shop.stripe, connectAccountId: account.id, connectOnboardingStatus: 'not_started' },
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
    // Only 'complete' is sticky; not_started <-> pending always follow the live account.
    const currentStatus = shop.stripe!.connectOnboardingStatus ?? 'not_started';
    if (liveStatus !== currentStatus && currentStatus !== 'complete') {
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
    logServiceFailure('createStripeAccountSession', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to create Stripe account session',
    };
  }
}
