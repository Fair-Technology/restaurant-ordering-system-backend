import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', async () => {
  const { COMPLETE_IDENTITY } = await import('../../fixtures/legal');
  return { getPlatformLegalIdentity: vi.fn(async () => COMPLETE_IDENTITY) };
});
vi.mock('../../../src/application/order/_shared/missedOrders', () => ({
  recordMissedOrder: vi.fn(async () => null),
  resetMissedOrderStreak: vi.fn(async () => undefined),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { resetMissedOrderStreak } from '../../../src/application/order/_shared/missedOrders';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
import { GO_LIVE_TAX_ID_ERROR } from '../../../src/domain/order/orderErrors';
import { executeUpdateShop } from '../../../src/application/shop/updateShop/executeUpdateShop';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_shop'],
};

function makeShop(overrides: any = {}) {
  return {
    id: 'shop-1',
    name: 'Pizzeria',
    slug: 'p',
    countryCode: 'DE',
    menuLanguages: ['de'],
    isPaused: true,
    address: {},
    openingHours: {},
    members: [],
    createdAt: 'x',
    updatedAt: 'x',
    isDeleted: false,
    ...overrides,
  };
}

describe('executeUpdateShop menu languages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (findShopById as any).mockResolvedValue(makeShop());
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('saves an added menu language', async () => {
    const result = await executeUpdateShop({ shopId: 'shop-1', menuLanguages: ['de', 'en'] } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ menuLanguages: ['de', 'en'] }));
  });

  it('refuses to change the original language', async () => {
    const result = await executeUpdateShop({ shopId: 'shop-1', menuLanguages: ['en'] } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'The original menu language (de) cannot be changed',
    });
  });
});

describe('executeUpdateShop banner switch', () => {
  const branding = { logoUrl: null, heroImageUrl: 'https://cdn.example.com/h.jpg', accentColor: null };

  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('saves the switch and keeps the uploaded picture', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ branding }));
    const result = await executeUpdateShop({ shopId: 'shop-1', branding: { ...branding, showHero: false } } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ branding: { ...branding, showHero: false } }),
    );
  });

  it('refuses a non-boolean switch', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ branding }));
    const result = await executeUpdateShop({ shopId: 'shop-1', branding: { ...branding, showHero: 'no' } } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'branding.showHero must be a boolean' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('logs turning the banner off, treating a missing switch as on', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ branding }));
    await executeUpdateShop({ shopId: 'shop-1', branding: { ...branding, showHero: false } } as any, {} as any);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'shop.update',
        changes: expect.arrayContaining([{ field: 'branding.showHero', from: true, to: false }]),
      }),
    );
  });

  it('logs nothing about the banner when an explicit true replaces a missing switch', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ branding }));
    await executeUpdateShop({ shopId: 'shop-1', branding: { ...branding, showHero: true } } as any, {} as any);

    const call = (logAudit as any).mock.calls[0][0];
    expect(call.changes.some((c: any) => c.field === 'branding.showHero')).toBe(false);
  });
});

describe('executeUpdateShop go-live', () => {
  function makeGoLiveReadyShop(overrides: any = {}) {
    return makeShop({
      name: 'Pizzeria',
      address: { street: 'Main St 1', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Germany' },
      branding: { logoUrl: 'https://cdn.example.com/logo.png', heroImageUrl: null, accentColor: null },
      openingHours: { mon: [{ open: '09:00', close: '17:00' }] },
      stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
      legal: COMPLETE_LEGAL,
      dpaAcceptance: ACCEPTED_DPA,
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('refuses to go live again while only an outdated DPA version is accepted', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({ dpaAcceptance: { ...ACCEPTED_DPA, version: '2025-01-01' } }),
    );
    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Accept the data processing agreement before going live',
    });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('lets an already-live shop save its status while only an outdated DPA version is accepted', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({ isPaused: false, dpaAcceptance: { ...ACCEPTED_DPA, version: '2025-01-01' } }),
    );

    const result = await executeUpdateShop(
      { shopId: 'shop-1', isPaused: false, pausedMessage: 'Back soon' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ isPaused: false, pausedMessage: 'Back soon' }),
    );
  });

  it('refuses to go live without an accepted DPA', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop({ dpaAcceptance: null }));
    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Accept the data processing agreement before going live',
    });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('allows going live with no logo uploaded', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({ branding: { logoUrl: null, heroImageUrl: null, accentColor: null } }),
    );

    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result.ok).toBe(true);
  });
  const READY_CATALOG = () => {
    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);
  };

  it('refuses to go live without completed Stripe onboarding', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop({ stripe: null }));
    READY_CATALOG();

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Stripe payments onboarding is not complete',
    });
  });

  it('refuses to go live without a tax number or VAT ID', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({
        legal: { ...COMPLETE_LEGAL, impressum: { ...COMPLETE_LEGAL.impressum!, vatId: '' } },
      }),
    );
    READY_CATALOG();

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: GO_LIVE_TAX_ID_ERROR });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('goes live with Stripe connected and a tax ID set', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({
        legal: { ...COMPLETE_LEGAL, impressum: { ...COMPLETE_LEGAL.impressum!, vatId: '' }, taxNumber: '045/123/45678' },
      }),
    );
    READY_CATALOG();

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ isPaused: false }));
  });

  it('ignores a paymentPolicy sent by an older admin', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop());

    const result = await executeUpdateShop({ shopId: 'shop-1', paymentPolicy: 'bitcoin' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.not.objectContaining({ paymentPolicy: expect.anything() }));
  });
});

describe('executeUpdateShop pausing orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (findShopById as any).mockResolvedValue(makeShop({ isPaused: false }));
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('saves ordersPaused with a trimmed message, then clears it', async () => {
    const on = await executeUpdateShop(
      { shopId: 'shop-1', ordersPaused: true, ordersPausedMessage: '  Back at 7  ' } as any,
      {} as any,
    );
    expect(on.ok).toBe(true);
    expect(updateShop).toHaveBeenLastCalledWith(
      expect.objectContaining({ ordersPaused: true, ordersPausedMessage: 'Back at 7' }),
    );

    const off = await executeUpdateShop(
      { shopId: 'shop-1', ordersPaused: false, ordersPausedMessage: '   ' } as any,
      {} as any,
    );
    expect(off.ok).toBe(true);
    const saved = (updateShop as any).mock.calls.at(-1)[0];
    expect(saved.ordersPaused).toBe(false);
    expect(saved.ordersPausedMessage).toBeUndefined();
  });

  it('rejects a bad ordersPaused and an over-long message', async () => {
    expect(await executeUpdateShop({ shopId: 'shop-1', ordersPaused: 'yes' } as any, {} as any)).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(
      await executeUpdateShop({ shopId: 'shop-1', ordersPausedMessage: 'x'.repeat(281) } as any, {} as any),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('ignores superadmin fields sent by the owner', async () => {
    await executeUpdateShop({ shopId: 'shop-1', offlineBySuperadmin: true, ordersPaused: true } as any, {} as any);
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.offlineBySuperadmin).toBeUndefined();
  });

  it('refuses to bring the shop online while the platform has it offline', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ isPaused: true, offlineBySuperadmin: true }));
    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);
    expect(result).toMatchObject({ ok: false, code: 'SHOP_OFFLINE_BY_SUPERADMIN' });
    expect(updateShop).not.toHaveBeenCalled();
  });
});

describe('executeUpdateShop pause durations', () => {
  const berlin = (o: any = {}) => makeShop({ isPaused: false, timezone: 'Europe/Berlin', ...o });
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (findShopById as any).mockResolvedValue(berlin());
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('30 minutes stores the end time and starts the count again', async () => {
    const now = new Date('2026-10-17T12:00:00Z');
    const res = await executeUpdateShop({ shopId: 'shop-1', ordersPaused: true, ordersPausedFor: 'minutes_30' }, {} as any, { now });
    expect(res.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ ordersPaused: true, ordersPausedUntil: '2026-10-17T12:30:00.000Z', ordersAutoPaused: null }),
    );
    expect(resetMissedOrderStreak).toHaveBeenCalledWith('shop-1', now);
  });

  it('rest of today ends at 04:00 local', async () => {
    await executeUpdateShop({ shopId: 'shop-1', ordersPaused: true, ordersPausedFor: 'rest_of_day' }, {} as any, {
      now: new Date('2026-10-17T20:00:00Z'),
    });
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ ordersPausedUntil: '2026-10-18T02:00:00.000Z' }));
  });

  it('no duration (older admin) pauses until switched back', async () => {
    await executeUpdateShop({ shopId: 'shop-1', ordersPaused: true }, {} as any, { now: new Date('2026-10-17T12:00:00Z') });
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ ordersPaused: true, ordersPausedUntil: null }));
  });

  it('switching off clears the end time and the automatic mark', async () => {
    (findShopById as any).mockResolvedValue(
      berlin({ ordersPaused: true, ordersPausedUntil: '2026-10-17T12:30:00.000Z', ordersAutoPaused: { missedOrders: 3, at: 'x' } }),
    );
    await executeUpdateShop({ shopId: 'shop-1', ordersPaused: false }, {} as any, { now: new Date('2026-10-17T12:10:00Z') });
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ ordersPaused: false, ordersPausedUntil: null, ordersAutoPaused: null }),
    );
  });

  it.each([
    [{ ordersPausedFor: 'minutes_30' }],
    [{ ordersPaused: false, ordersPausedFor: 'minutes_30' }],
    [{ ordersPaused: true, ordersPausedFor: '1h' }],
  ])('a duration needs ordersPaused: true (%j)', async (body) => {
    const res = await executeUpdateShop({ shopId: 'shop-1', ...body } as any, {} as any);
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('saving only the message leaves the count alone', async () => {
    await executeUpdateShop({ shopId: 'shop-1', ordersPausedMessage: 'x' }, {} as any);
    expect(resetMissedOrderStreak).not.toHaveBeenCalled();
  });
});
