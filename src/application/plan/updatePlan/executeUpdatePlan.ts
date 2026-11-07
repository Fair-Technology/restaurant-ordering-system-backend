import { HttpRequest } from '@azure/functions';
import { findPlanById, updatePlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { ApplicationResult } from '../../_shared/types';
import { UpdatePlanRequestDto, UpdatePlanResultDto } from './dtos';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';

const VALID_LIMIT_KEYS = new Set(Object.values(PLAN_LIMIT_KEYS));

export async function executeUpdatePlan(
  planId: string,
  request: UpdatePlanRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdatePlanResultDto>> {
  if (!planId || typeof planId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
  }

  if (request.name !== undefined && (typeof request.name !== 'string' || request.name.trim() === '')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'name must be a non-empty string' };
  }

  if (request.sortOrder !== undefined) {
    if (!Number.isInteger(request.sortOrder) || request.sortOrder < 0) {
      return { ok: false, code: 'INVALID_INPUT', error: 'sortOrder must be a non-negative integer' };
    }
  }

  if (request.limits) {
    for (const limit of request.limits) {
      if (!VALID_LIMIT_KEYS.has(limit.key as any)) {
        return { ok: false, code: 'INVALID_INPUT', error: `Unknown limit key: ${limit.key}` };
      }
      if (!Number.isInteger(limit.value) || limit.value < -1) {
        return { ok: false, code: 'INVALID_INPUT', error: `Limit value for ${limit.key} must be an integer >= -1` };
      }
    }
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const plan = await findPlanById(planId);
    if (!plan) {
      return { ok: false, code: 'NOT_FOUND', error: 'Plan not found' };
    }

    const updated = {
      ...plan,
      name: request.name !== undefined ? request.name.trim() : plan.name,
      isVisible: request.isVisible !== undefined ? request.isVisible : plan.isVisible,
      sortOrder: request.sortOrder !== undefined ? request.sortOrder : plan.sortOrder,
      limits: request.limits !== undefined ? request.limits : plan.limits,
      updatedAt: new Date().toISOString(),
    };

    const result = await updatePlan(updated);
    return { ok: true, data: { plan: result } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update plan' };
  }
}
