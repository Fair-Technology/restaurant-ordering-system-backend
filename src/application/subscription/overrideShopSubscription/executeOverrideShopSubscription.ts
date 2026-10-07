import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPlanById, findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { OverrideShopSubscriptionRequestDto, OverrideShopSubscriptionResultDto } from './dtos';
import { ShopSubscription, defaultSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';

export async function executeOverrideShopSubscription(
  shopId: string,
  request: OverrideShopSubscriptionRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<OverrideShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  if (!request.planId || typeof request.planId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
  }

  if (!request.overrideReason || typeof request.overrideReason !== 'string' || request.overrideReason.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'overrideReason is required and must be a non-empty string' };
  }

  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const plan = await findPlanById(request.planId);
    if (!plan) {
      return { ok: false, code: 'NOT_FOUND', error: 'Plan not found' };
    }

    const now = new Date().toISOString();
    let current = await findSubscriptionByShopId(shopId);

    if (!current) {
      const defaultPlan = await findDefaultPlan();
      current = defaultSubscription(shopId, defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now);
    }

    const updated: ShopSubscription = {
      ...current,
      planId: request.planId,
      status: plan.isDefault ? 'free' : 'active',
      planSource: 'superadmin_override',
      overriddenBy: userId,
      overrideReason: request.overrideReason.trim(),
      overrideExpiresAt: request.overrideExpiresAt ?? null,
      updatedAt: now,
    };

    const result = await upsertSubscription(updated);

    await logAudit({
      shopId,
      actorType: 'superadmin',
      actorId: userId,
      action: 'subscription.override',
      entityType: 'subscription',
      entityId: shopId,
      entityName: `Shop ${shopId}`,
      changes: [
        { field: 'planId', from: current.planId, to: request.planId },
        { field: 'planSource', from: current.planSource, to: 'superadmin_override' },
      ],
    });

    return { ok: true, data: { subscription: result } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to override subscription' };
  }
}
