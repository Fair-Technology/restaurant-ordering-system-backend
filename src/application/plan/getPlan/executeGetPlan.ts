import { HttpRequest } from '@azure/functions';
import { findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPlanResultDto } from './dtos';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';

export async function executeGetPlan(
  planId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetPlanResultDto>> {
  try {
    const adminId = await requirePlatform(httpRequest, 'read');
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    if (!planId || typeof planId !== 'string') {
      return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
    }

    const plan = await findPlanById(planId);
    if (!plan) {
      return { ok: false, code: 'NOT_FOUND', error: 'Plan not found' };
    }

    const pricing = await findPricingByPlan(planId);
    return { ok: true, data: { plan, pricing } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve plan' };
  }
}
