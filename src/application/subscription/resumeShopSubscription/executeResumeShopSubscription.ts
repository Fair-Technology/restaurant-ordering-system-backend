import { HttpRequest } from '@azure/functions';
import Stripe from 'stripe';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { ResumeShopSubscriptionResultDto } from './dtos';

export async function executeResumeShopSubscription(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ResumeShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_billing');
    if (!access.ok) return access;

    const subscription = await findSubscriptionByShopId(shopId);
    if (!subscription?.billingSubscriptionId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'No active paid subscription found' };
    }
    if (!subscription.cancelAtPeriodEnd) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Subscription is not scheduled for cancellation' };
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' };
    }

    const stripe = new Stripe(stripeSecretKey);
    await stripe.subscriptions.update(subscription.billingSubscriptionId, {
      cancel_at_period_end: false,
    });

    const now = new Date().toISOString();
    const updated = {
      ...subscription,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    };
    await upsertSubscription(updated);

    await logAudit({
      ...toAuditActor(access.actor),
      action: 'subscription.cancelResumed',
      entityType: 'subscription',
      entityId: subscription.id,
      entityName: `Shop ${shopId}`,
      shopId,
      changes: [],
    });

    return {
      ok: true,
      data: {
        id: updated.id,
        shopId: updated.shopId,
        planId: updated.planId,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        currentPeriodEnd: updated.currentPeriodEnd,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to resume subscription' };
  }
}
