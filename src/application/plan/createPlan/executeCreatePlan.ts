import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findAllPlans, createPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { ApplicationResult } from '../../_shared/types';
import { CreatePlanRequestDto, CreatePlanResultDto } from './dtos';
import { Plan } from '../../../domain/plan/Plan';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';

const VALID_LIMIT_KEYS = new Set(Object.values(PLAN_LIMIT_KEYS));

export async function executeCreatePlan(
  request: CreatePlanRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreatePlanResultDto>> {
  if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'name is required and must be a non-empty string' };
  }

  if (!request.internalKey || typeof request.internalKey !== 'string' || request.internalKey.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'internalKey is required and must be a non-empty string' };
  }

  const sortOrder = request.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return { ok: false, code: 'INVALID_INPUT', error: 'sortOrder must be a non-negative integer' };
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
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const allPlans = await findAllPlans();

    // Keys must be unique, ignoring case and surrounding spaces
    const internalKey = request.internalKey.trim();
    if (allPlans.some((p) => (p.internalKey ?? '').trim().toLowerCase() === internalKey.toLowerCase())) {
      return { ok: false, code: 'CONFLICT', error: `A plan with key '${internalKey}' already exists.` };
    }

    // Enforce only one default plan
    if (request.isDefault) {
      const existingDefault = allPlans.find((p) => p.isDefault);
      if (existingDefault) {
        return { ok: false, code: 'INVALID_INPUT', error: 'A default plan already exists. Update the existing default plan first.' };
      }
    }

    const now = new Date().toISOString();
    const plan: Plan = {
      id: crypto.randomUUID(),
      name: request.name.trim(),
      internalKey,
      isDefault: request.isDefault ?? false,
      isVisible: request.isVisible ?? true,
      sortOrder,
      limits: request.limits ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const created = await createPlan(plan);
    return { ok: true, data: { plan: created } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create plan' };
  }
}
