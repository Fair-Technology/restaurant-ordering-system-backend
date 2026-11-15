import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  requirePlatform: vi.fn(),
}));
vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getUserIdFromAuth: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findVisiblePlans: vi.fn(),
  findAllPlans: vi.fn(),
}));

import { requirePlatform } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { getUserIdFromAuth } from '../../../src/infrastructure/auth/authHelpers';
import {
  findVisiblePlans,
  findAllPlans,
} from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { executeGetPlans } from '../../../src/application/plan/getPlans/executeGetPlans';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';

const VISIBLE = [{ id: 'a', isVisible: true }];
const ALL = [
  { id: 'a', isVisible: true },
  { id: 'b', isVisible: false },
];
const req = {} as any;

describe('executeGetPlans', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUserIdFromAuth).mockResolvedValue('u1' as any);
    vi.mocked(findVisiblePlans).mockResolvedValue(VISIBLE as any);
    vi.mocked(findAllPlans).mockResolvedValue(ALL as any);
  });

  it('default: returns visible plans only', async () => {
    const result = await executeGetPlans(req);
    expect(result).toEqual({ ok: true, data: { plans: VISIBLE } });
    expect(findVisiblePlans).toHaveBeenCalled();
    expect(findAllPlans).not.toHaveBeenCalled();
  });

  it('includeHidden with a platform reader returns all plans', async () => {
    vi.mocked(requirePlatform).mockResolvedValue('op1' as any);
    const result = await executeGetPlans(req, { includeHidden: true });
    expect(requirePlatform).toHaveBeenCalledWith(req, 'read');
    expect(result).toEqual({ ok: true, data: { plans: ALL } });
    expect(findAllPlans).toHaveBeenCalled();
    expect(findVisiblePlans).not.toHaveBeenCalled();
  });

  it('includeHidden with a non-platform caller is FORBIDDEN and leaks nothing', async () => {
    vi.mocked(requirePlatform).mockResolvedValue(null as any);
    const result = await executeGetPlans(req, { includeHidden: true });
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(mapResultToHttp(result).status).toBe(403);
    expect(findAllPlans).not.toHaveBeenCalled();
    expect(findVisiblePlans).not.toHaveBeenCalled();
  });

  it('includeHidden with no/invalid auth is FORBIDDEN', async () => {
    vi.mocked(requirePlatform).mockResolvedValue(null as any);
    const result = await executeGetPlans(req, { includeHidden: true });
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
