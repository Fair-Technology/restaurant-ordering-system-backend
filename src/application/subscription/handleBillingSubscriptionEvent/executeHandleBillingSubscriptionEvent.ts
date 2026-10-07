import { findSubscriptionByBillingSubscriptionId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';

export type BillingSubscriptionEventType =
  | 'subscription.updated'
  | 'subscription.deleted'
  | 'invoice.payment_failed'
  | 'invoice.payment_succeeded';

export interface BillingSubscriptionEventData {
  billingSubscriptionId: string;
  status?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  planId?: string | null; // billing provider plan/price ID
}

export async function executeHandleBillingSubscriptionEvent(
  eventType: BillingSubscriptionEventType,
  data: BillingSubscriptionEventData,
): Promise<void> {
  const subscription = await findSubscriptionByBillingSubscriptionId(data.billingSubscriptionId);
  if (!subscription) return;

  const now = new Date().toISOString();

  switch (eventType) {
    case 'subscription.updated': {
      const updated = {
        ...subscription,
        currentPeriodStart: data.periodStart ?? subscription.currentPeriodStart,
        currentPeriodEnd: data.periodEnd ?? subscription.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? subscription.cancelAtPeriodEnd,
        status: (data.cancelAtPeriodEnd ? 'canceled' : 'active') as any,
        planSource: 'billing' as const,
        updatedAt: now,
      };
      await upsertSubscription(updated);
      break;
    }
    case 'subscription.deleted': {
      const defaultPlan = await findDefaultPlan();
      const updated = {
        ...subscription,
        planId: defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID,
        status: 'expired' as const,
        billingSubscriptionId: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        planSource: 'billing' as const,
        updatedAt: now,
      };
      await upsertSubscription(updated);
      break;
    }
    case 'invoice.payment_failed': {
      const updated = { ...subscription, status: 'past_due' as const, updatedAt: now };
      await upsertSubscription(updated);
      break;
    }
    case 'invoice.payment_succeeded': {
      const updated = {
        ...subscription,
        status: 'active' as const,
        currentPeriodStart: data.periodStart ?? subscription.currentPeriodStart,
        currentPeriodEnd: data.periodEnd ?? subscription.currentPeriodEnd,
        planSource: 'billing' as const,
        updatedAt: now,
      };
      await upsertSubscription(updated);
      break;
    }
  }
}
