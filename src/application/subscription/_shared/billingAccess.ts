import { HttpRequest } from '@azure/functions';
import Stripe from 'stripe';
import type { Shop } from '../../../domain/shop/Shop';
import type { Plan } from '../../../domain/plan/Plan';
import type { ShopSubscription } from '../../../domain/subscription/ShopSubscription';
import { effectiveLimits } from '../../../domain/subscription/entitlements';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { listStaffAccounts } from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import type { ShopAccess } from '../../_shared/shopAccess';
import type { ApplicationError } from '../../_shared/types';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';

/** The restaurant, if the caller may manage its billing (owners only; not superadmin, as with cancel and resume). */
export async function authorizeBilling(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<({ ok: true; shop: Shop } & ShopAccess) | ApplicationError> {
  const shop = await findShopById(shopId);
  if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(httpRequest, shop, 'manage_billing');
  if (!access.ok) return access;
  return { ...access, shop };
}

export function stripeFromEnv(): Stripe | ApplicationError {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' };
  return new Stripe(key);
}

export function isApplicationError(v: unknown): v is ApplicationError {
  return typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;
}

export function adminSubscriptionUrl(shopId: string): string | ApplicationError {
  const base = process.env.ADMIN_APP_URL;
  if (!base) return { ok: false, code: 'INTERNAL_ERROR', error: 'Admin app URL is not configured' };
  return `${base}/shops/${shopId}/subscription`;
}

/** The staff cap the plan would give this restaurant, or null when it has none. Only stored counts matter for a downgrade. */
export async function staffCapIfBlocked(
  shopId: string,
  target: Pick<Plan, 'limits'>,
  sub: Pick<ShopSubscription, 'limitOverride'> | null,
  now: Date,
): Promise<number | null> {
  const cap = effectiveLimits(target, sub?.limitOverride, now)[PLAN_LIMIT_KEYS.STAFF_ACCOUNTS];
  if (cap === undefined || cap === -1) return null;
  const active = (await listStaffAccounts(shopId)).filter((a) => a.isActive).length;
  return active > cap ? cap : null;
}
