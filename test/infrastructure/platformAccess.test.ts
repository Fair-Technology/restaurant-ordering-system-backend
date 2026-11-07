import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import {
  isPlatformAdmin,
  Principal,
  PLATFORM_OWNER_ROLE,
  PLATFORM_SUPPORT_ROLE,
  PLATFORM_READONLY_ROLE,
} from '../../src/infrastructure/auth/principal';

vi.mock('../../src/infrastructure/auth/principal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/infrastructure/auth/principal')>();
  return { ...actual, authenticate: vi.fn() };
});

vi.mock('../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
}));

import { authenticate } from '../../src/infrastructure/auth/principal';
import { verifySuperAdminToken } from '../../src/infrastructure/auth/superAdminAuthHelpers';
import { findUserById } from '../../src/infrastructure/cosmos/user/CosmosUserRepository';

const request = {} as HttpRequest;

const platform = (roles: string[]): Principal => ({
  kind: 'entra',
  userId: 'staff-1',
  issuer: 'platform',
  roles,
});

const customer = (roles: string[] = []): Principal => ({
  kind: 'entra',
  userId: 'cust-1',
  issuer: 'customer',
  roles,
});

describe('isPlatformAdmin', () => {
  it('accepts a workforce operator holding Owner', () => {
    expect(isPlatformAdmin(platform([PLATFORM_OWNER_ROLE]))).toBe(true);
  });

  it('accepts a workforce operator holding Support', () => {
    expect(isPlatformAdmin(platform([PLATFORM_SUPPORT_ROLE]))).toBe(true);
  });

  it('denies ReadOnly, because the console has no per-endpoint read/write split yet', () => {
    expect(isPlatformAdmin(platform([PLATFORM_READONLY_ROLE]))).toBe(false);
  });

  it('denies a workforce identity with no role assigned', () => {
    expect(isPlatformAdmin(platform([]))).toBe(false);
  });

  // The important one: a customer-store token must never buy platform access by
  // claiming a platform role, because those roles are only assigned in Entra on
  // the workforce API registration.
  it('denies a customer-tenant token even if it carries a platform role', () => {
    expect(isPlatformAdmin(customer([PLATFORM_OWNER_ROLE]))).toBe(false);
  });

  it('denies a shop staff principal', () => {
    expect(
      isPlatformAdmin({ kind: 'staff', staffId: 'st-1', shopId: 'shop-1', role: 'manager' }),
    ).toBe(false);
  });
});

describe('verifySuperAdminToken', () => {
  beforeEach(() => {
    vi.mocked(authenticate).mockReset();
    vi.mocked(findUserById).mockReset();
  });

  it('authorises a platform operator by role, without touching the users container', async () => {
    vi.mocked(authenticate).mockResolvedValue(platform([PLATFORM_OWNER_ROLE]));

    await expect(verifySuperAdminToken(request)).resolves.toBe('staff-1');
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('denies a platform operator whose only role is ReadOnly', async () => {
    vi.mocked(authenticate).mockResolvedValue(platform([PLATFORM_READONLY_ROLE]));

    await expect(verifySuperAdminToken(request)).resolves.toBeNull();
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('still honours the legacy database flag for customer identities', async () => {
    vi.mocked(authenticate).mockResolvedValue(customer());
    vi.mocked(findUserById).mockResolvedValue({
      id: 'cust-1',
      systemRole: 'superadmin',
    } as never);

    await expect(verifySuperAdminToken(request)).resolves.toBe('cust-1');
  });

  it('denies a customer identity without the flag', async () => {
    vi.mocked(authenticate).mockResolvedValue(customer());
    vi.mocked(findUserById).mockResolvedValue({ id: 'cust-1', systemRole: 'user' } as never);

    await expect(verifySuperAdminToken(request)).resolves.toBeNull();
  });

  it('never lets a platform identity fall back to the legacy flag', async () => {
    vi.mocked(authenticate).mockResolvedValue(platform([]));
    vi.mocked(findUserById).mockResolvedValue({
      id: 'staff-1',
      systemRole: 'superadmin',
    } as never);

    await expect(verifySuperAdminToken(request)).resolves.toBeNull();
  });

  it('denies shop staff principals', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      kind: 'staff',
      staffId: 'st-1',
      shopId: 'shop-1',
      role: 'manager',
    });

    await expect(verifySuperAdminToken(request)).resolves.toBeNull();
  });

  it('returns null rather than throwing when the token is invalid', async () => {
    vi.mocked(authenticate).mockRejectedValue(new Error('Authentication required'));

    await expect(verifySuperAdminToken(request)).resolves.toBeNull();
  });
});
