import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

// Only the token verifier and the stores are faked. The real authorisation chain
// (platformAccessLevel -> requirePlatform / verifySuperAdminToken) and a real
// platform endpoint (executeGetAllShops) run, so this proves what an operator
// holding - or lacking - the workforce platform role actually reaches.
vi.mock('../../src/infrastructure/auth/authHelpers', () => ({
  verifyEntraAccessToken: vi.fn(),
}));
vi.mock('../../src/infrastructure/auth/staffTokens', () => ({
  verifyStaffToken: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findAllShopsIncludingDeleted: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  upsertSystemConfig: vi.fn(),
}));

import { verifyEntraAccessToken } from '../../src/infrastructure/auth/authHelpers';
import { findUserById } from '../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findAllShopsIncludingDeleted } from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { upsertSystemConfig } from '../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { executeUpdateSystemConfig } from '../../src/application/systemConfig/updateSystemConfig/executeUpdateSystemConfig';
import { executeGetAllShops } from '../../src/application/shop/getAllShops/executeGetAllShops';

// A syntactically valid RS256 header is all authenticate() inspects before
// delegating to the (mocked) verifier.
const header = Buffer.from(
  JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
).toString('base64url');
const request = {
  headers: new Headers({ authorization: `Bearer ${header}.e30.sig` }),
} as unknown as HttpRequest;

const asToken = (issuer: 'platform' | 'customer', roles: string[]) =>
  vi.mocked(verifyEntraAccessToken).mockResolvedValue({
    oid: 'user-1',
    email: 'op@example.test',
    name: 'Op',
    issuer,
    roles,
  } as never);

describe('platform endpoints, end to end through the real authorisation chain', () => {
  beforeEach(() => {
    vi.mocked(verifyEntraAccessToken).mockReset();
    vi.mocked(findUserById).mockReset();
    vi.mocked(findUserById).mockResolvedValue(null);
    vi.mocked(findAllShopsIncludingDeleted).mockReset();
    vi.mocked(findAllShopsIncludingDeleted).mockResolvedValue([]);
  });

  it.each(['Platform.Owner', 'Platform.Support'])(
    'lets a workforce operator holding %s reach the platform endpoint, with no users-container lookup',
    async (role) => {
      asToken('platform', [role]);

      const result = await executeGetAllShops({} as never, request);

      expect(result.ok).toBe(true);
      expect(findAllShopsIncludingDeleted).toHaveBeenCalled();
      expect(findUserById).not.toHaveBeenCalled();
    },
  );

  it.each([[[]], [['Something.Else']]])(
    'keeps a workforce operator with roles %j out of the platform endpoint',
    async (roles) => {
      asToken('platform', roles);
      // Even a stale legacy flag on the same oid must not rescue a platform identity.
      vi.mocked(findUserById).mockResolvedValue({
        id: 'user-1',
        systemRole: 'superadmin',
      } as never);

      const result = await executeGetAllShops({} as never, request);

      expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
      expect(findAllShopsIncludingDeleted).not.toHaveBeenCalled();
    },
  );

  it('lets a ReadOnly operator read (getAllShops) with no users-container lookup', async () => {
    asToken('platform', ['Platform.ReadOnly']);

    const result = await executeGetAllShops({} as never, request);

    expect(result.ok).toBe(true);
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('refuses a ReadOnly operator a write (getSystemConfig is read; updateSystemConfig is not)', async () => {
    asToken('platform', ['Platform.ReadOnly']);

    const result = await executeUpdateSystemConfig({ maxShopsDefault: 3 } as never, request);

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(upsertSystemConfig).not.toHaveBeenCalled();
  });

  it('does not let a customer-tenant token buy access by carrying a platform role', async () => {
    asToken('customer', ['Platform.Owner']);

    const result = await executeGetAllShops({} as never, request);

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
