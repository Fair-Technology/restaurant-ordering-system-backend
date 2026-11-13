import { HttpRequest } from '@azure/functions';
import { findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlanAndCurrency, upsertPricing } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { ApplicationResult } from '../../_shared/types';
import { SetPlanPricingRequestDto, SetPlanPricingResultDto } from './dtos';
import { PlanPricing } from '../../../domain/plan/PlanPricing';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

const ISO4217_REGEX = /^[A-Z]{3}$/;

export async function executeSetPlanPricing(
  planId: string,
  request: SetPlanPricingRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetPlanPricingResultDto>> {
  if (!planId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'planId is required' };
  }

  if (!request.currency || !ISO4217_REGEX.test(request.currency)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'currency must be a valid ISO 4217 3-letter uppercase code' };
  }

  if (!Number.isInteger(request.monthlyAmountCents) || request.monthlyAmountCents < 0) {
    return { ok: false, code: 'INVALID_INPUT', error: 'monthlyAmountCents must be a non-negative integer' };
  }

  if (!Number.isInteger(request.yearlyAmountCents) || request.yearlyAmountCents < 0) {
    return { ok: false, code: 'INVALID_INPUT', error: 'yearlyAmountCents must be a non-negative integer' };
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

    if (plan.isDefault && (request.monthlyAmountCents !== 0 || request.yearlyAmountCents !== 0)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Free (default) plan pricing must be 0/0' };
    }

    const now = new Date().toISOString();
    const existing = await findPricingByPlanAndCurrency(planId, request.currency);

    const pricing: PlanPricing = {
      id: existing?.id ?? crypto.randomUUID(),
      planId,
      currency: request.currency,
      monthlyAmountCents: request.monthlyAmountCents,
      yearlyAmountCents: request.yearlyAmountCents,
      billingPriceIdMonthly: request.billingPriceIdMonthly ?? existing?.billingPriceIdMonthly ?? null,
      billingPriceIdYearly: request.billingPriceIdYearly ?? existing?.billingPriceIdYearly ?? null,
      isActive: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const result = await upsertPricing(pricing);
    return { ok: true, data: { pricing: result } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('setPlanPricing', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set plan pricing' };
  }
}
