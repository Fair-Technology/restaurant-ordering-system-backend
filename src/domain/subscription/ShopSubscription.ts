import type { PlanLimit } from '../plan/Plan';

export type SubscriptionStatus =
  | 'free'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type PlanSource = 'default' | 'billing' | 'superadmin_override';

export interface LimitOverride {
  limits: PlanLimit[]; // only the keys being changed; value -1 = unlimited
  reason: string;
  expiresAt: string | null; // ISO; null = until removed
  setBy: string; // superadmin user id
  setAt: string; // ISO
}

export interface ShopSubscription {
  id: string; // === shopId
  shopId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval: 'monthly' | 'yearly' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  planSource: PlanSource;
  overriddenBy: string | null;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  limitOverride?: LimitOverride | null;
  planBeforeOverride?: string | null; // plan in force when a plan override was first applied
  createdAt: string;
  updatedAt: string;
}

export function defaultSubscription(shopId: string, defaultPlanId: string, nowIso: string): ShopSubscription {
  return {
    id: shopId,
    shopId,
    planId: defaultPlanId,
    status: 'free',
    billingInterval: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    billingCustomerId: null,
    billingSubscriptionId: null,
    cancelAtPeriodEnd: false,
    planSource: 'default',
    overriddenBy: null,
    overrideReason: null,
    overrideExpiresAt: null,
    limitOverride: null,
    planBeforeOverride: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
