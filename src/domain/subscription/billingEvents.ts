import { isOverrideActive } from './entitlements';
import type { ShopSubscription } from './ShopSubscription';

export type BillingEvent =
  | {
      kind: 'subscription.updated';
      stripeStatus: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      mapped: { planId: string; billingInterval: 'monthly' | 'yearly' } | null; // the plan the subscription's price belongs to
    }
  | { kind: 'subscription.deleted' }
  | { kind: 'invoice.payment_failed' }
  | { kind: 'invoice.paid' };

/** Folds one Stripe notification into the local record. Pure, and applying the same event twice changes nothing more. */
export function applyBillingEvent(
  local: ShopSubscription,
  event: BillingEvent,
  ctx: { defaultPlanId: string; now: Date },
): ShopSubscription {
  const at = ctx.now.toISOString();
  const overrideOn = isOverrideActive(local, ctx.now);
  switch (event.kind) {
    case 'subscription.updated': {
      let next: ShopSubscription = {
        ...local,
        currentPeriodStart: event.periodStart ?? local.currentPeriodStart,
        currentPeriodEnd: event.periodEnd ?? local.currentPeriodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        updatedAt: at,
      };
      if (event.stripeStatus === 'active' || event.stripeStatus === 'trialing') {
        next = { ...next, status: 'active', paymentFailedAt: null, graceWarningsSent: 0 };
      } else if (event.stripeStatus === 'past_due' || event.stripeStatus === 'unpaid') {
        next = { ...next, status: 'past_due', paymentFailedAt: local.paymentFailedAt ?? at };
      }
      if (event.mapped) {
        const pending = local.scheduledChange;
        if (overrideOn) {
          next = { ...next, planBeforeOverride: event.mapped.planId };
        } else if (pending && pending.planId === event.mapped.planId && ctx.now.getTime() < Date.parse(pending.effectiveAt)) {
          // the downgrade is still pending: the current plan stays until its date
        } else {
          next = {
            ...next,
            planId: event.mapped.planId,
            billingInterval: event.mapped.billingInterval,
            planSource: 'billing',
            scheduledChange: pending && pending.planId === event.mapped.planId ? null : (pending ?? null),
          };
        }
      }
      return next;
    }
    case 'subscription.deleted':
      return {
        ...local,
        ...(overrideOn
          ? { planBeforeOverride: ctx.defaultPlanId }
          : { planId: ctx.defaultPlanId, planSource: 'default' as const }),
        status: 'expired',
        billingSubscriptionId: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        scheduledChange: null,
        paymentFailedAt: null,
        graceWarningsSent: 0,
        updatedAt: at,
      };
    case 'invoice.payment_failed':
      return { ...local, status: 'past_due', paymentFailedAt: local.paymentFailedAt ?? at, updatedAt: at };
    case 'invoice.paid':
      return { ...local, status: 'active', paymentFailedAt: null, graceWarningsSent: 0, updatedAt: at };
  }
}
