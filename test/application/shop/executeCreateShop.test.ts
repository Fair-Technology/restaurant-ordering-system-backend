import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  createShop: vi.fn(async (s: any) => s),
  findShopBySlug: vi.fn(async () => null),
  findOwnedShopIds: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getUserIdFromAuth: vi.fn(async () => 'user-1'),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ systemRole: 'owner', maxShops: null })),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ maxShopsDefault: 3 })),
}));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  upsertSubscription: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({
  upsertUsage: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-free' })),
}));

import { createShop as createShopInRepo } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CURRENT_DPA } from '../../../src/domain/legal/platformDocuments';
import { executeCreateShop } from '../../../src/application/shop/createShop/executeCreateShop';

function baseRequest(overrides: any = {}) {
  return {
    name: 'Pizzeria Napoli',
    industry: 'restaurant',
    countryCode: 'DE',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    minOrderAmountCents: 1000,
    address: { street: 'Main St 1', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Germany' },
    openingHours: { mon: [{ open: '09:00', close: '17:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    ...overrides,
  };
}

describe('executeCreateShop payment policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('ignores a paymentPolicy sent by an older admin', async () => {
    const result = await executeCreateShop(baseRequest({ paymentPolicy: 'pay_in_person' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.not.objectContaining({ paymentPolicy: expect.anything() }));
  });
});

describe('executeCreateShop DPA acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('records DPA acceptance when the current version is sent', async () => {
    const result = await executeCreateShop(baseRequest({ acceptDpaVersion: CURRENT_DPA.version }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({
        dpaAcceptance: expect.objectContaining({
          version: CURRENT_DPA.version,
          acceptedByUserId: 'user-1',
          shopNameAtAcceptance: 'Pizzeria Napoli',
        }),
      }),
    );
  });

  it('rejects an outdated DPA version', async () => {
    const result = await executeCreateShop(baseRequest({ acceptDpaVersion: '2025-01-01' }), {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'The data processing agreement has changed — reload and accept the current version',
    });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });

  it('leaves dpaAcceptance null when none is sent', async () => {
    await executeCreateShop(baseRequest(), {} as any);

    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({ dpaAcceptance: null, dpaAcceptanceHistory: [] }),
    );
  });
});
