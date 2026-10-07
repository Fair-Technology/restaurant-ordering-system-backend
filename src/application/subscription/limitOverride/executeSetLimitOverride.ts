import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { defaultSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';
import { logAudit } from '../../_shared/auditHelpers';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { ApplicationResult } from '../../_shared/types';
import { LimitOverrideResultDto, SetLimitOverrideRequestDto } from './dtos';

const LIMIT_KEYS: string[] = Object.values(PLAN_LIMIT_KEYS);

function validate(request: SetLimitOverrideRequestDto, now: Date): string | null {
  if (!Array.isArray(request?.limits) || request.limits.length < 1) return 'At least one limit is required';
  for (const l of request.limits) {
    if (!l || !LIMIT_KEYS.includes(l.key)) return `Unknown limit key: ${l?.key}`;
    if (!Number.isInteger(l.value) || l.value < -1) return `Limit value for ${l.key} must be an integer >= -1`;
  }
  const reason = typeof request.reason === 'string' ? request.reason.trim() : '';
  if (reason.length < 1 || reason.length > 500) return 'overrideReason is required';
  if (request.expiresAt !== undefined && request.expiresAt !== null) {
    if (typeof request.expiresAt !== 'string' || !(Date.parse(request.expiresAt) > now.getTime())) {
      return 'expiresAt must be in the future';
    }
  }
  return null;
}

/** Superadmin: replace some of a restaurant's plan limits, with a reason and an optional end date. */
export async function executeSetLimitOverride(
  shopId: string,
  request: SetLimitOverrideRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<LimitOverrideResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const now = new Date();
    const invalid = validate(request, now);
    if (invalid) return { ok: false, code: 'INVALID_INPUT', error: invalid };

    const nowIso = now.toISOString();
    const defaultPlan = await findDefaultPlan();
    const current =
      (await findSubscriptionByShopId(shopId)) ??
      defaultSubscription(shopId, defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, nowIso);
    const prev = current.limitOverride;
    const limits = request.limits.map((l) => ({ key: l.key, value: l.value }));

    const result = await upsertSubscription({
      ...current,
      limitOverride: { limits, reason: request.reason.trim(), expiresAt: request.expiresAt ?? null, setBy: userId, setAt: nowIso },
      updatedAt: nowIso,
    });

    await logAudit({
      shopId,
      actorType: 'superadmin',
      actorId: userId,
      action: 'subscription.limit_override',
      entityType: 'subscription',
      entityId: shopId,
      entityName: `Shop ${shopId}`,
      changes: limits.map((l) => ({
        field: `limit.${l.key}`,
        from: prev?.limits.find((p) => p.key === l.key)?.value ?? null,
        to: l.value,
      })),
    });

    return { ok: true, data: { subscription: result } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set the limit override' };
  }
}
