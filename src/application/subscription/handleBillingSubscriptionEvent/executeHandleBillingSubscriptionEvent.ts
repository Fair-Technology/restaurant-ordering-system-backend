import { findSubscriptionByBillingSubscriptionId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPlanByInternalKey } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findShopById, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';

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

      // Clear isDeactivatedDueToLimits when subscription becomes active again
      if (!data.cancelAtPeriodEnd) {
        const shop = await findShopById(subscription.shopId);
        if (shop?.isDeactivatedDueToLimits) {
          await updateShop({ ...shop, isDeactivatedDueToLimits: false, updatedAt: now });
        }
      }
      break;
    }
    case 'subscription.deleted': {
      const freePlan = await findPlanByInternalKey('free');
      const updated = {
        ...subscription,
        planId: freePlan?.id ?? subscription.planId,
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
