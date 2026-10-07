import type { Plan } from '../plan/Plan';
import type { LimitOverride, ShopSubscription } from './ShopSubscription';

export const FALLBACK_DEFAULT_PLAN_ID = 'default-free';

export interface Entitlements {
  planId: string; // the plan in force right now
  limits: Record<string, number>; // -1 = unlimited; a missing key = no limit
  limitOverrideActive: boolean;
  planOverrideExpired: boolean;
}

export function isOverrideExpired(sub: Pick<ShopSubscription, 'planSource' | 'overrideExpiresAt'>, now: Date): boolean {
  return sub.planSource === 'superadmin_override' && !!sub.overrideExpiresAt && now.getTime() >= Date.parse(sub.overrideExpiresAt);
}

export function effectivePlanId(sub: ShopSubscription | null, defaultPlanId: string, now: Date): string {
  if (!sub) return defaultPlanId;
  if (isOverrideExpired(sub, now)) return sub.planBeforeOverride ?? defaultPlanId;
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
