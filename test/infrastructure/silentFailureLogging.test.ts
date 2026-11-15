import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  handlers: {} as Record<string, any>,
  findShopById: vi.fn(),
}));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, o: any) => {
      m.handlers[name] = o;
    },
  },
}));
vi.mock('../../src/application/systemConfig/updateSystemConfig/executeUpdateSystemConfig', () => ({
  executeUpdateSystemConfig: vi.fn(),
}));
vi.mock('../../src/application/systemConfig/updateRolePermissions/executeUpdateRolePermissions', () => ({
  executeUpdateRolePermissions: vi.fn(),
}));
vi.mock('../../src/application/user/updateUserLimits/executeUpdateUserLimits', () => ({
  executeUpdateUserLimits: vi.fn(),
}));
vi.mock('../../src/application/reference/updateReferenceLists/executeUpdateReferenceLists', () => ({
  executeUpdateReferenceLists: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findShopById: m.findShopById,
}));
vi.mock('../../src/infrastructure/cosmos/category/CosmosCategoryRepository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findCategoriesByShopId: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/infrastructure/cosmos/product/CosmosProductRepository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findProductsByShopId: vi.fn().mockResolvedValue([]),
}));
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';
import { internalServerError } from '../../src/functions/_shared/internalServerError';
import { logAuthFailure } from '../../src/infrastructure/auth/logAuthFailure';
import { logServiceFailure } from '../../src/application/_shared/logServiceFailure';
import { executeGetCatalog } from '../../src/application/category/getCatalog/executeGetCatalog';
import { adminSubscriptionUrl, stripeFromEnv } from '../../src/application/subscription/_shared/billingAccess';
import '../../src/functions/systemConfig/updateSystemConfig/index';
import '../../src/functions/systemConfig/updateRolePermissions/index';
import '../../src/functions/user/updateUserLimits/index';
import '../../src/functions/reference/updateReferenceLists/index';

afterEach(() => vi.restoreAllMocks());
const spy = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('silent-failure logging never changes the outcome', () => {
  it('mapResultToHttp logs the code on an unmapped result and still returns the same 500', () => {
    const log = spy();
    const res = mapResultToHttp({ ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' });
    expect(res).toEqual({ status: 500, jsonBody: { error: 'Internal server error' } });
    expect(log.mock.calls[0][0]).toContain('code=INTERNAL_ERROR');
  });

  it('mapped codes do not log', () => {
    const log = spy();
    expect(mapResultToHttp({ ok: false, code: 'NOT_FOUND', error: 'x' }).status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });

  it('internalServerError logs the cause and returns the bare 500', () => {
    const log = spy();
    const res = internalServerError('checkout', Object.assign(new Error('boom'), { type: 'StripePermissionError' }));
    expect(res).toEqual({ status: 500, jsonBody: { error: 'Internal server error' } });
    const lines = log.mock.calls.map((c) => c[0]).join('\n');
    expect(lines).toContain('handler=checkout');
    expect(lines).toContain('boom');
    expect(lines).toContain('[stripe:failure]');
  });

  it('logAuthFailure stays quiet for an ordinary bad credential and speaks for anything else', () => {
    const log = spy();
    logAuthFailure('x', new Error('Authentication required'));
    expect(log).not.toHaveBeenCalled();
    logAuthFailure('requirePlatform', new Error('STAFF_JWT_SECRET is not configured'));
    expect(log.mock.calls[0][0]).toContain('site=requirePlatform');
    expect(log.mock.calls[0][0]).toContain('STAFF_JWT_SECRET is not configured');
  });

  it('logServiceFailure logs a plain error on one line', () => {
    const log = spy();
    logServiceFailure('AcceptOrder', new Error('cosmos down'));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('site=AcceptOrder');
  });
});

describe('the swept silent failures now log', () => {
  const malformed = () => ({ params: {}, json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')) });

  for (const name of ['updateSystemConfig', 'updateRolePermissions', 'updateUserLimits', 'updateReferenceLists']) {
    it(`${name}: a malformed body is logged with handler=${name} and returns the standard 500`, async () => {
      const log = spy();
      const res = await m.handlers[name].handler(malformed());
      expect(res).toEqual({ status: 500, jsonBody: { error: 'Internal server error' } });
      const lines = log.mock.calls.map((c) => String(c[0])).join('\n');
      expect(lines).toContain(`handler=${name}`);
      expect(lines).toContain('Unexpected end of JSON input');
    });
  }

  it('executeGetCatalog logs site=getCatalog and still returns INTERNAL_ERROR when the shop read fails', async () => {
    const log = spy();
    m.findShopById.mockRejectedValueOnce(new Error('cosmos down'));
    const res = await executeGetCatalog({ shopId: 'shop-1' });
    expect(res).toEqual({ ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve catalog' });
    const lines = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('site=getCatalog');
    expect(lines).toContain('cosmos down');
  });

  it('stripeFromEnv logs the missing STRIPE_SECRET_KEY and still returns INTERNAL_ERROR', () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const log = spy();
      expect(stripeFromEnv()).toEqual({ ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' });
      expect(log.mock.calls[0][0]).toContain('STRIPE_SECRET_KEY');
    } finally {
      if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it('adminSubscriptionUrl logs the missing ADMIN_APP_URL and still returns INTERNAL_ERROR', () => {
    const saved = process.env.ADMIN_APP_URL;
    delete process.env.ADMIN_APP_URL;
    try {
      const log = spy();
      expect(adminSubscriptionUrl('shop-1')).toEqual({
        ok: false,
        code: 'INTERNAL_ERROR',
        error: 'Admin app URL is not configured',
      });
      expect(log.mock.calls[0][0]).toContain('ADMIN_APP_URL');
    } finally {
      if (saved !== undefined) process.env.ADMIN_APP_URL = saved;
    }
  });
});
