import { logServiceFailure } from '../../_shared/logServiceFailure';
import { HttpRequest } from '@azure/functions';
import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { LimitOverrideResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';

/** Superadmin: remove a restaurant's limit override so its plan limits apply again. */
export async function executeClearLimitOverride(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<LimitOverrideResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const current = await findSubscriptionByShopId(shopId);
    if (!current?.limitOverride) {
      return { ok: false, code: 'NOT_FOUND', error: 'No limit override' };
    }

    const result = await upsertSubscription({ ...current, limitOverride: null, updatedAt: new Date().toISOString() });

    await logAudit({
      shopId,
      actorType: 'superadmin',
      actorId: adminId,
      action: 'subscription.limit_override_clear',
      entityType: 'subscription',
      entityId: shopId,
      entityName: `Shop ${shopId}`,
      changes: [],
    });

    return { ok: true, data: { subscription: result } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('ClearLimitOverride', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to remove the limit override' };
  }
}
