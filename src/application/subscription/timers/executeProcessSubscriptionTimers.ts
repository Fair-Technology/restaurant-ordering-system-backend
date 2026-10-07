import type { ShopSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID, GRACE_WARNING_DAYS, graceEndsAt, isOverrideActive, limitOf } from '../../../domain/subscription/entitlements';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findSubscriptionsNeedingTimers,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { sendEmail } from '../../../infrastructure/email/emailSender';
import { logAudit } from '../../_shared/auditHelpers';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { ownerRecipients } from '../../usage/orderLimitWarnings';
import { buildPaymentGraceEmail } from './paymentGraceEmail';

export interface SubscriptionTimersResult {
  graceEmails: number;
  changesApplied: number;
  overridesExpired: number;
}

const DAY_MS = 86_400_000;

/** Hourly: sends the grace-period warnings, applies downgrades that have come due, and tidies expired manual plans. */
export async function executeProcessSubscriptionTimers(input: { now: Date }): Promise<SubscriptionTimersResult> {
  const { now } = input;
  const result: SubscriptionTimersResult = { graceEmails: 0, changesApplied: 0, overridesExpired: 0 };
  const due = await findSubscriptionsNeedingTimers(now.toISOString());
  if (due.length === 0) return result;
  const defaultPlan = await findDefaultPlan();
  const defaultPlanId = defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID;

  for (const found of due) {
    try {
      let sub = found;

      // Grace warnings: the number due so far minus the number already sent. The count is saved before each send,
      // so a crash in between loses one email instead of repeating it every hour.
      const grace = graceEndsAt(sub);
      if (grace && sub.paymentFailedAt && now.getTime() < Date.parse(grace)) {
        const failedAt = Date.parse(sub.paymentFailedAt);
        const dueCount = GRACE_WARNING_DAYS.filter((d) => now.getTime() >= failedAt + d * DAY_MS).length;
        const shop = (sub.graceWarningsSent ?? 0) < dueCount ? await findShopById(sub.shopId) : null;
        while (shop && (sub.graceWarningsSent ?? 0) < dueCount) {
          const n = (sub.graceWarningsSent ?? 0) + 1;
          sub = await upsertSubscription({ ...sub, graceWarningsSent: n, updatedAt: now.toISOString() });
          const to = await ownerRecipients(shop);
          if (to.length === 0) continue;
          await sendEmail({
            to,
            ...buildPaymentGraceEmail({
              shop,
              n: Math.min(n, 3) as 1 | 2 | 3,
              graceEndsAt: grace,
              defaultPlanName: defaultPlan?.name ?? '',
              defaultOrderLimit: defaultPlan ? limitOf({ limits: Object.fromEntries(defaultPlan.limits.map((l) => [l.key, l.value])) }, PLAN_LIMIT_KEYS.ORDERS_PER_MONTH) : null,
              url: `${process.env.ADMIN_APP_URL ?? 'http://localhost:5173'}/shops/${shop.id}/subscription`,
            }),
            replyTo: null,
            tag: 'payment_grace_warning',
          });
          result.graceEmails += 1;
        }
      }

      // A downgrade whose paid period has ended.
      if (sub.scheduledChange && now.getTime() >= Date.parse(sub.scheduledChange.effectiveAt)) {
        const { planId, billingInterval } = sub.scheduledChange;
        // While a manual plan from superadmin is active it keeps the plan; the downgrade lands when the manual plan ends.
        sub = await upsertSubscription({
          ...sub,
          ...(isOverrideActive(sub, now) ? { planBeforeOverride: planId } : { planId }),
          billingInterval,
          scheduledChange: null,
          updatedAt: now.toISOString(),
        });
        result.changesApplied += 1;
      }

      // A manual plan from superadmin whose end date has passed.
      if (sub.planSource === 'superadmin_override' && sub.overrideExpiresAt && now.getTime() >= Date.parse(sub.overrideExpiresAt)) {
        const before = sub.planId;
        const next: ShopSubscription = {
          ...sub,
          planId: sub.planBeforeOverride ?? defaultPlanId,
          planSource: sub.billingSubscriptionId ? 'billing' : 'default',
          overriddenBy: null,
          overrideReason: null,
          overrideExpiresAt: null,
          planBeforeOverride: null,
          updatedAt: now.toISOString(),
        };
        await upsertSubscription(next);
        await logAudit({
          actorType: 'system',
          actorId: 'system',
          action: 'subscription.override_expired',
          entityType: 'subscription',
          entityId: sub.id,
          entityName: `Shop ${sub.shopId}`,
          shopId: sub.shopId,
          changes: [{ field: 'planId', from: before, to: next.planId }],
        });
        result.overridesExpired += 1;
      }
    } catch (err) {
      console.error('[subscriptionTimers:error]', found.shopId, err instanceof Error ? err.message : 'unknown');
    }
  }
  return result;
}
