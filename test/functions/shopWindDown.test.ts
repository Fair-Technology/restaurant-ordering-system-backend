import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

// The Functions runtime is faked to capture registrations; the identity is faked at `authenticate`.
// The env gate, the handler, the auth decision (isSuperAdminPrincipal / platformAccessLevel) and the
// result mapping are the REAL code. The wind-down itself is stubbed: its behaviour is covered by
// test/application/shop/windDownShops.test.ts.
const m = vi.hoisted(() => ({
  timers: {} as Record<string, any>,
  http: {} as Record<string, any>,
  principal: null as unknown,
}));
vi.mock('@azure/functions', () => ({
  app: {
    timer: (name: string, o: any) => { m.timers[name] = o; },
    http: (name: string, o: any) => { m.http[name] = o; },
  },
}));
vi.mock('../../src/infrastructure/auth/principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/auth/principal')>()),
  authenticate: vi.fn(async () => {
    if (!m.principal) throw new Error('Authentication required');
    return m.principal;
  }),
}));
vi.mock('../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../src/application/shop/windDown/executeWindDownShops', () => ({
  executeWindDownShops: vi.fn(async () => ({
    shopsWoundDown: 1, ordersAnonymised: 2, productsDeleted: 3, categoriesDeleted: 2, failures: 0,
  })),
}));

const SUPERADMIN = { kind: 'entra', userId: 'admin-1', issuer: 'platform', roles: ['Platform.Owner'] };
const READONLY_OPERATOR = { kind: 'entra', userId: 'ro-1', issuer: 'platform', roles: ['Platform.ReadOnly'] };
const RESTAURANT_OWNER = { kind: 'entra', userId: 'owner-1', issuer: 'customer', roles: [] };
const STAFF = { kind: 'staff', staffId: 's1', shopId: 'shop-1', role: 'manager' };

const req = (body: unknown = { now: '2026-11-01T00:00:00.000Z' }, shopId = 'shop-1') =>
  ({
    params: { shopId },
    headers: new Headers(m.principal ? { authorization: 'Bearer x' } : {}),
    json: async () => body,
  }) as unknown as HttpRequest;

async function loadRoute() {
  vi.resetModules();
  m.http = {};
  const route = await import('../../src/functions/shop/runShopWindDownWithClock/index');
  const { executeWindDownShops } = await import('../../src/application/shop/windDown/executeWindDownShops');
  return { route, executeWindDownShops };
}

const ORIGINAL = process.env.ENABLE_TEST_CLOCK_ROUTES;
beforeEach(() => {
  m.principal = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ENABLE_TEST_CLOCK_ROUTES;
  else process.env.ENABLE_TEST_CLOCK_ROUTES = ORIGINAL;
  vi.restoreAllMocks();
});

describe('shopWindDown timer', () => {
  it('runs the wind-down daily with the real clock', async () => {
    vi.resetModules();
    await import('../../src/functions/shop/shopWindDownTimer/index');
    const { executeWindDownShops } = await import('../../src/application/shop/windDown/executeWindDownShops');
    expect(m.timers.shopWindDown.schedule).toBe('0 30 3 * * *');
    await m.timers.shopWindDown.handler();
    expect(executeWindDownShops).toHaveBeenCalledWith({ now: expect.any(Date) });
  });
});

describe('injected-clock wind-down route', () => {
  describe('production (ENABLE_TEST_CLOCK_ROUTES not "true")', () => {
    for (const value of [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true']) {
      it(`is absent and answers a bare 404 when the setting is ${JSON.stringify(value)}`, async () => {
        if (value === undefined) delete process.env.ENABLE_TEST_CLOCK_ROUTES;
        else process.env.ENABLE_TEST_CLOCK_ROUTES = value;
        const { route, executeWindDownShops } = await loadRoute();

        // Not registered at all...
        expect(m.http.runShopWindDownWithClock).toBeUndefined();
        // ...and the handler itself, even with a superadmin token, says only "not here".
        m.principal = SUPERADMIN;
        const res = await route.runShopWindDownWithClockHandler(req());
        expect(res).toEqual({ status: 404 });
        expect(executeWindDownShops).not.toHaveBeenCalled();
      });
    }

    it('answers the same 404 with or without a token, so existence is not revealed', async () => {
      delete process.env.ENABLE_TEST_CLOCK_ROUTES;
      const { route } = await loadRoute();
      const anonymous = await route.runShopWindDownWithClockHandler(req());
      m.principal = RESTAURANT_OWNER;
      const owner = await route.runShopWindDownWithClockHandler(req());
      m.principal = SUPERADMIN;
      const admin = await route.runShopWindDownWithClockHandler(req());
      expect(anonymous).toEqual(owner);
      expect(owner).toEqual(admin);
    });
  });

  describe('dev (ENABLE_TEST_CLOCK_ROUTES = "true")', () => {
    beforeEach(() => {
      process.env.ENABLE_TEST_CLOCK_ROUTES = 'true';
    });

    it('is registered as a POST under platform/', async () => {
      await loadRoute();
      const reg = m.http.runShopWindDownWithClock;
      expect(reg).toBeDefined();
      expect(reg.methods).toEqual(['POST']);
      expect(reg.route).toBe('platform/test-clock/shops/{shopId}/wind-down');
    });

    it('no token → 401', async () => {
      const { executeWindDownShops } = await loadRoute();
      const res = await m.http.runShopWindDownWithClock.handler(req());
      expect(res.status).toBe(401);
      expect(executeWindDownShops).not.toHaveBeenCalled();
    });

    for (const [label, principal] of [
      ['restaurant owner', RESTAURANT_OWNER],
      ['shop staff', STAFF],
      ['read-only platform operator', READONLY_OPERATOR],
    ] as const) {
      it(`non-superadmin token (${label}) → 403`, async () => {
        const { executeWindDownShops } = await loadRoute();
        m.principal = principal;
        const res = await m.http.runShopWindDownWithClock.handler(req());
        expect(res.status).toBe(403);
        expect(executeWindDownShops).not.toHaveBeenCalled();
      });
    }

    it('superadmin token → 200, runs the same wind-down for that one shop with the supplied clock', async () => {
      const { executeWindDownShops } = await loadRoute();
      m.principal = SUPERADMIN;
      const res = await m.http.runShopWindDownWithClock.handler(req({ now: '2026-11-01T00:00:00.000Z' }, 'shop-9'));
      expect(res.status).toBe(200);
      expect(res.jsonBody).toEqual({ shopsWoundDown: 1, ordersAnonymised: 2, productsDeleted: 3, categoriesDeleted: 2, failures: 0 });
      expect(executeWindDownShops).toHaveBeenCalledWith({
        now: new Date('2026-11-01T00:00:00.000Z'),
        onlyShopIds: ['shop-9'],
        actor: { actorType: 'superadmin', actorId: 'admin-1' },
      });
    });

    it('superadmin with a missing or unreadable clock → 400, nothing runs', async () => {
      const { executeWindDownShops } = await loadRoute();
      m.principal = SUPERADMIN;
      for (const body of [null, {}, { now: 'soon' }, { now: 1234 }]) {
        const res = await m.http.runShopWindDownWithClock.handler(req(body));
        expect(res.status).toBe(400);
      }
      expect(executeWindDownShops).not.toHaveBeenCalled();
    });
  });
});
