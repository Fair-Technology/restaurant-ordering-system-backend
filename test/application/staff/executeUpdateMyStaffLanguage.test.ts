import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/principal', () => ({ authenticate: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  findStaffAccountById: vi.fn(),
  replaceStaffAccount: vi.fn(),
}));

import { authenticate } from '../../../src/infrastructure/auth/principal';
import {
  findStaffAccountById,
  replaceStaffAccount,
} from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { executeUpdateMyStaffLanguage } from '../../../src/application/staff/updateMyLanguage/executeUpdateMyStaffLanguage';

const staffPrincipal = { kind: 'staff', staffId: 'st-1', shopId: 'shop-1', role: 'staff' };
const account = {
  id: 'st-1', shopId: 'shop-1', username: 'kitchen', displayName: null, role: 'staff',
  passwordHash: 'secret', language: null, isActive: true, isDeleted: false,
  failedLoginCount: 0, lockedUntil: null, lastLoginAt: null, createdBy: 'o',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('executeUpdateMyStaffLanguage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (replaceStaffAccount as any).mockImplementation(async (a: any) => a);
  });

  it('persists a valid language and returns it', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(account);
    const res = await executeUpdateMyStaffLanguage({ language: 'en' }, {} as any);
    expect(replaceStaffAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'st-1', language: 'en' }));
    expect(res.ok && res.data.language).toBe('en');
    expect(res.ok && res.data).not.toHaveProperty('passwordHash');
  });

  it('rejects an unsupported language without writing', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(account);
    const res = await executeUpdateMyStaffLanguage({ language: 'fr' as never }, {} as any);
    expect(!res.ok && res.code).toBe('INVALID_INPUT');
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });

  it('refuses an owner (Entra) token', async () => {
    (authenticate as any).mockResolvedValue({ kind: 'entra', userId: 'u' });
    const res = await executeUpdateMyStaffLanguage({ language: 'de' }, {} as any);
    expect(!res.ok && res.code).toBe('FORBIDDEN');
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });

  it('missing or deleted account is NOT_FOUND', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue({ ...account, isDeleted: true });
    const res = await executeUpdateMyStaffLanguage({ language: 'de' }, {} as any);
    expect(!res.ok && res.code).toBe('NOT_FOUND');
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });
});
