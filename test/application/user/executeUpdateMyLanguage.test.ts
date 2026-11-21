import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getPrincipalFromAuth: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
  upsertUser: vi.fn(),
}));

import { getPrincipalFromAuth } from '../../../src/infrastructure/auth/authHelpers';
import { findUserById, upsertUser } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { executeUpdateMyLanguage } from '../../../src/application/user/updateMyLanguage/executeUpdateMyLanguage';

const http = {} as HttpRequest;
const customer = { kind: 'entra', userId: 'cust-1', email: 'owner@example.com', name: 'Owner', issuer: 'customer', roles: [] };
const operator = { ...customer, userId: 'op-1', issuer: 'platform', roles: ['Platform.Owner'] };

describe('executeUpdateMyLanguage', () => {
  beforeEach(() => {
    vi.mocked(getPrincipalFromAuth).mockReset();
    vi.mocked(findUserById).mockReset();
    vi.mocked(upsertUser).mockReset();
  });

  it('persists a valid language and returns it', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
    vi.mocked(findUserById).mockResolvedValue({ id: 'cust-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 'x' } as never);
    vi.mocked(upsertUser).mockImplementation(async (p) => p);

    const res = await executeUpdateMyLanguage({ language: 'en' }, http);

    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cust-1', language: 'en', createdAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(res.ok && res.data.language).toBe('en');
  });

  it('rejects an unsupported language without writing', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
    const res = await executeUpdateMyLanguage({ language: 'fr' as never }, http);
    expect(!res.ok && res.code).toBe('INVALID_INPUT');
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('refuses a platform operator without writing', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(operator as never);
    const res = await executeUpdateMyLanguage({ language: 'de' }, http);
    expect(!res.ok && res.code).toBe('FORBIDDEN');
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    vi.mocked(getPrincipalFromAuth).mockRejectedValue(new Error('Authentication required'));
    const res = await executeUpdateMyLanguage({ language: 'de' }, http);
    expect(!res.ok && res.code).toBe('FORBIDDEN');
  });
});
