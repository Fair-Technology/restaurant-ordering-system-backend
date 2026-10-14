import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getUserIdFromAuth: vi.fn(async () => 'u1'),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ id: 'u1', systemRole: 'superadmin' })),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findAllPlans: vi.fn(),
  createPlan: vi.fn(async (p: any) => p),
}));

import { findAllPlans, createPlan } from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { executeCreatePlan } from '../../../src/application/plan/createPlan/executeCreatePlan';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';

const EXISTING = [
  { id: 'plan-basic', internalKey: 'free', isDefault: true },
  { id: 'plan-pro', internalKey: 'pro', isDefault: false },
];

const run = (internalKey: string) =>
  executeCreatePlan({ name: 'Dup Test', internalKey } as any, {} as any);

describe('executeCreatePlan internalKey uniqueness', () => {
  beforeEach(() => {
    vi.mocked(findAllPlans).mockResolvedValue(EXISTING as any);
    vi.mocked(createPlan).mockClear();
  });

  it.each(['pro', 'PRO', 'Pro ', '  pro'])('rejects duplicate key %j', async (key) => {
    const result = await run(key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.error).toBe(`A plan with key '${key.trim()}' already exists.`);
      expect(mapResultToHttp(result).status).toBe(409);
    }
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('creates a plan with a unique key, stored trimmed', async () => {
    const result = await run(' team ');
    expect(result.ok).toBe(true);
    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ internalKey: 'team' }));
  });
});
