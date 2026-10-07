import type { Plan } from '../plan/Plan';
import type { LimitOverride, ShopSubscription } from './ShopSubscription';

export const FALLBACK_DEFAULT_PLAN_ID = 'default-free';

export const PAYMENT_GRACE_DAYS = 7;
export const GRACE_WARNING_DAYS = [0, 3, 6] as const; // days after the failure on which a warning email is due

export interface Entitlements {
  planId: string; // the plan in force right now
  limits: Record<string, number>; // -1 = unlimited; a missing key = no limit
  limitOverrideActive: boolean;
  planOverrideExpired: boolean;
  graceEndsAt: string | null; // set while a payment is failing
  droppedForNonPayment: boolean; // grace has run out, so the default plan applies
}

export function isOverrideExpired(sub: Pick<ShopSubscription, 'planSource' | 'overrideExpiresAt'>, now: Date): boolean {
  return sub.planSource === 'superadmin_override' && !!sub.overrideExpiresAt && now.getTime() >= Date.parse(sub.overrideExpiresAt);
}

export function isOverrideActive(sub: Pick<ShopSubscription, 'planSource' | 'overrideExpiresAt'>, now: Date): boolean {
  return sub.planSource === 'superadmin_override' && !isOverrideExpired(sub, now);
}

export function graceEndsAt(sub: Pick<ShopSubscription, 'status' | 'paymentFailedAt'>): string | null {
  return sub.status === 'past_due' && sub.paymentFailedAt
    ? new Date(Date.parse(sub.paymentFailedAt) + PAYMENT_GRACE_DAYS * 86_400_000).toISOString()
    : null;
}

/** Whether the grace period after a failed payment has run out. */
export function isGraceOver(sub: Pick<ShopSubscription, 'status' | 'paymentFailedAt'>, now: Date): boolean {
  const grace = graceEndsAt(sub);
  return !!grace && now.getTime() >= Date.parse(grace);
}

export function effectivePlanId(sub: ShopSubscription | null, defaultPlanId: string, now: Date): string {
  if (!sub) return defaultPlanId;
  if (isOverrideActive(sub, now)) return sub.planId;
  if (isOverrideExpired(sub, now)) return sub.planBeforeOverride ?? defaultPlanId;
  if (isGraceOver(sub, now)) return defaultPlanId;
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && now.getTime() >= Date.parse(sub.currentPeriodEnd)) return defaultPlanId;
  if (sub.scheduledChange && now.getTime() >= Date.parse(sub.scheduledChange.effectiveAt)) return sub.scheduledChange.planId;
  return sub.planId;
}

export function isLimitOverrideActive(o: LimitOverride | null | undefined, now: Date): o is LimitOverride {
  return !!o && (o.expiresAt === null || now.getTime() < Date.parse(o.expiresAt));
}

export function effectiveLimits(
  plan: Pick<Plan, 'limits'> | null,
  o: LimitOverride | null | undefined,
  now: Date,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of plan?.limits ?? []) out[l.key] = l.value;
  if (isLimitOverrideActive(o, now)) for (const l of o.limits) out[l.key] = l.value;
  return out;
}

export function limitOf(e: Pick<Entitlements, 'limits'>, key: string): number | null {
  const v = e.limits[key];
  return v === undefined || v === -1 ? null : v;
}
