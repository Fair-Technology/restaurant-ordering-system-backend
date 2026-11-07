import { HttpRequest } from '@azure/functions';
import { getPrincipalFromAuth } from '../../../infrastructure/auth/authHelpers';
import { isSuperAdminPrincipal } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPlanPricingResultDto } from './dtos';

// Superadmin: every row incl. Stripe price ids, any plan.
// Everyone else (owners): visible plans only, active rows only, Stripe ids stripped.
export async function executeGetPlanPricing(
  planId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetPlanPricingResultDto>> {
  try {
    // Still mandatory: an anonymous caller must not reach the visible-plan path below.
    const principal = await getPrincipalFromAuth(httpRequest);

    if (!planId || typeof planId !== 'string') {
      return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
    }

    const isSuperadmin = await isSuperAdminPrincipal(principal);

    const plan = await findPlanById(planId);
    if (!plan || (!isSuperadmin && plan.isVisible !== true)) {
      return { ok: false, code: 'NOT_FOUND', error: 'Plan not found' };
    }

    const pricing = await findPricingByPlan(planId);
    if (isSuperadmin) return { ok: true, data: pricing };

    const data = pricing
      .filter((p) => p.isActive)
      .map((p) => ({ ...p, billingPriceIdMonthly: null, billingPriceIdYearly: null }));
    return { ok: true, data };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve plan pricing' };
  }
}
