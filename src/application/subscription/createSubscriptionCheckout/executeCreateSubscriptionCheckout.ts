import { HttpRequest } from '@azure/functions';
import { findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlanAndCurrency } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { isStripeCardError } from '../../../infrastructure/stripe/billingEventParsing';
import { UPGRADE_DECLINED_ERROR, downgradeBlockedStaffError } from '../../../domain/order/orderErrors';
import { toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { loadEntitlements } from '../../_shared/entitlements';
import { adminSubscriptionUrl, authorizeBilling, isApplicationError, staffCapIfBlocked, stripeFromEnv } from '../_shared/billingAccess';

export type SubscriptionChangeResultDto =
  | { kind: 'checkout'; url: string } // no paid subscription yet: pay through Stripe Checkout
  | { kind: 'applied'; planId: string } // an upgrade or interval switch, done now
  | { kind: 'scheduled'; planId: string; effectiveAt: string }; // a downgrade, at the end of the paid period

export async function executeCreateSubscriptionCheckout(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SubscriptionChangeResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const body = (await httpRequest.json()) as { planId?: string; billingInterval?: string };
    const { planId, billingInterval } = body;

    if (!planId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
    }
    if (billingInterval !== 'monthly' && billingInterval !== 'yearly') {
      return { ok: false, code: 'INVALID_INPUT', error: 'billingInterval must be monthly or yearly' };
    }

    const access = await authorizeBilling(shopId, httpRequest);
    if (!access.ok) return access;
    const { shop } = access;

    const target = await findPlanById(planId);
    if (!target) {
      return { ok: false, code: 'NOT_FOUND', error: 'Plan not found' };
    }
    if (target.isDefault) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Use cancel to move to the free plan' };
    }

    const pricing = await findPricingByPlanAndCurrency(planId, shop.currency ?? '');
    if (!pricing) {
      return { ok: false, code: 'INVALID_INPUT', error: 'No pricing configured for your currency' };
    }
    const stripePriceId = billingInterval === 'monthly' ? pricing.billingPriceIdMonthly : pricing.billingPriceIdYearly;
    if (!stripePriceId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Billing not configured for this interval' };
    }

    const stripe = stripeFromEnv();
    if (isApplicationError(stripe)) return stripe;
    const subscriptionUrl = adminSubscriptionUrl(shopId);
    if (isApplicationError(subscriptionUrl)) return subscriptionUrl;

    const now = new Date();
    const sub = await findSubscriptionByShopId(shopId);

    // No paid subscription yet: a card is needed, so go through Checkout.
    if (!sub?.billingSubscriptionId) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: stripePriceId, quantity: 1 }],
        metadata: { shopId, planId, billingInterval },
        ...(sub?.billingCustomerId ? { customer: sub.billingCustomerId } : { customer_creation: 'always' }),
        success_url: `${subscriptionUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${subscriptionUrl}?payment=cancelled`,
      });
      if (!session.url) {
        return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create checkout session' };
      }
      return { ok: true, data: { kind: 'checkout', url: session.url } };
    }

    const ent = await loadEntitlements(shopId, now);
    const current = await findPlanById(ent.planId);
    if (!current) {
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Could not read the current plan' };
    }
    if (target.id === current.id && sub.billingInterval === billingInterval) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Already on this plan' };
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(sub.billingSubscriptionId);
    const itemId = stripeSubscription.items.data[0]?.id;
    if (!itemId) {
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Could not read current subscription' };
    }

    // A higher plan, or the same plan on the other interval: charged the difference now, effective at once.
    if (target.sortOrder >= current.sortOrder) {
      try {
        await stripe.subscriptions.update(sub.billingSubscriptionId, {
          items: [{ id: itemId, price: stripePriceId }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        });
      } catch (err) {
        if (isStripeCardError(err)) return { ok: false, code: 'CONFLICT', error: UPGRADE_DECLINED_ERROR };
        throw err;
      }
      await upsertSubscription({
        ...sub,
        planId: target.id,
        billingInterval,
        planSource: 'billing',
        scheduledChange: null,
        updatedAt: now.toISOString(),
      });
      await logAudit({
        ...toAuditActor(access.actor),
        action: 'subscription.upgrade',
        entityType: 'subscription',
        entityId: sub.id,
        entityName: `Shop ${shopId}`,
        shopId,
        changes: [{ field: 'planId', from: current.id, to: target.id }],
      });
      return { ok: true, data: { kind: 'applied', planId: target.id } };
    }

    // A lower plan: the price changes now (no proration), the plan changes when the paid period ends.
    const blockedAt = await staffCapIfBlocked(shopId, target, sub, now);
    if (blockedAt !== null) {
      return { ok: false, code: 'CONFLICT', error: downgradeBlockedStaffError(blockedAt) };
    }
    await stripe.subscriptions.update(sub.billingSubscriptionId, {
      items: [{ id: itemId, price: stripePriceId }],
      proration_behavior: 'none',
    });
    const effectiveAt = sub.currentPeriodEnd ?? now.toISOString();
    await upsertSubscription({
      ...sub,
      scheduledChange: { planId: target.id, billingInterval, effectiveAt },
      updatedAt: now.toISOString(),
    });
    await logAudit({
      ...toAuditActor(access.actor),
      action: 'subscription.change_scheduled',
      entityType: 'subscription',
      entityId: sub.id,
      entityName: `Shop ${shopId}`,
      shopId,
      changes: [{ field: 'planId', from: current.id, to: target.id }],
    });
    return { ok: true, data: { kind: 'scheduled', planId: target.id, effectiveAt } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to change the plan' };
  }
}
