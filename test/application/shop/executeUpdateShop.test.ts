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
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
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

describe('executeUpdateShop payment policy / go-live', () => {
  function makeGoLiveReadyShop(overrides: any = {}) {
    return makeShop({
      name: 'Pizzeria',
      address: { street: 'Main St 1', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Germany' },
      branding: { logoUrl: 'https://cdn.example.com/logo.png', heroImageUrl: null, accentColor: null },
      openingHours: { mon: [{ open: '09:00', close: '17:00' }] },
      paymentPolicy: 'pay_in_person',
      stripe: null,
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

  it('allows going live on pay_in_person with no Stripe set up', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop());

    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result.ok).toBe(true);
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

  it('refuses to go live on pay_online without completed Stripe onboarding', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop({ paymentPolicy: 'pay_online', stripe: null }));

    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop({ shopId: 'shop-1', isPaused: false } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Stripe payments onboarding is not complete',
    });
  });

  it('allows switching to pay_in_person and unpausing in the same request, with no Stripe', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({ paymentPolicy: 'pay_online', stripe: null, isPaused: true }),
    );

    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);

    const result = await executeUpdateShop(
      { shopId: 'shop-1', isPaused: false, paymentPolicy: 'pay_in_person' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ paymentPolicy: 'pay_in_person', isPaused: false }),
    );
  });

  it('rejects switching to pay_online while Stripe is not ready', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop({ paymentPolicy: 'pay_in_person', stripe: null }));

    const result = await executeUpdateShop(
      { shopId: 'shop-1', paymentPolicy: 'pay_online' } as any,
      {} as any,
    );

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Set up Stripe payments before offering online payment',
    });
  });

  it('allows switching to pay_online once Stripe onboarding is complete', async () => {
    (findShopById as any).mockResolvedValue(
      makeGoLiveReadyShop({
        paymentPolicy: 'pay_in_person',
        stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
      }),
    );

    const result = await executeUpdateShop(
      { shopId: 'shop-1', paymentPolicy: 'pay_online' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ paymentPolicy: 'pay_online' }));
  });

  it('rejects an invalid paymentPolicy value', async () => {
    (findShopById as any).mockResolvedValue(makeGoLiveReadyShop());

    const result = await executeUpdateShop({ shopId: 'shop-1', paymentPolicy: 'bitcoin' } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: "paymentPolicy must be 'pay_online' or 'pay_in_person'",
    });
  });
});
