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
  findPlanByInternalKey: vi.fn(async () => ({ id: 'plan-free' })),
}));

import { createShop as createShopInRepo } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
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

  it('defaults to pay_in_person when paymentPolicy is omitted', async () => {
    const result = await executeCreateShop(baseRequest(), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({ paymentPolicy: 'pay_in_person' }),
    );
  });

  it('coerces a requested pay_online to pay_in_person — a new shop never has Stripe yet', async () => {
    const result = await executeCreateShop(baseRequest({ paymentPolicy: 'pay_online' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({ paymentPolicy: 'pay_in_person' }),
    );
  });

  it('accepts an explicit pay_in_person', async () => {
    const result = await executeCreateShop(baseRequest({ paymentPolicy: 'pay_in_person' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({ paymentPolicy: 'pay_in_person' }),
    );
  });

  it('rejects an invalid paymentPolicy value', async () => {
    const result = await executeCreateShop(baseRequest({ paymentPolicy: 'bitcoin' }), {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: "paymentPolicy must be 'pay_online' or 'pay_in_person'",
    });
  });
});
