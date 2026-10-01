import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
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

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetGoLiveStatus } from '../../../src/application/shop/getGoLiveStatus/executeGetGoLiveStatus';

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
    address: {},
    openingHours: {},
    branding: null,
    paymentPolicy: 'pay_in_person',
    stripe: null,
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

describe('executeGetGoLiveStatus stripe_connected criterion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('is met when the shop is pay_in_person, even with no Stripe at all', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ paymentPolicy: 'pay_in_person', stripe: null }));

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const criterion = result.data.criteria.find((c) => c.key === 'stripe_connected');
      expect(criterion?.met).toBe(true);
    }
  });

  it('is unmet when the shop is pay_online without completed Stripe onboarding', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ paymentPolicy: 'pay_online', stripe: null }));

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const criterion = result.data.criteria.find((c) => c.key === 'stripe_connected');
      expect(criterion?.met).toBe(false);
      expect(criterion?.description).toBe(
        'Online payment needs Stripe set up — finish Stripe or switch to payment in person',
      );
    }
  });

  it('is met when the shop is pay_online with completed Stripe onboarding', async () => {
    (findShopById as any).mockResolvedValue(
      makeShop({
        paymentPolicy: 'pay_online',
        stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
      }),
    );

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const criterion = result.data.criteria.find((c) => c.key === 'stripe_connected');
      expect(criterion?.met).toBe(true);
    }
  });
});

describe('executeGetGoLiveStatus logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('does not list a logo as a go-live criterion — the storefront shows initials instead', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ branding: null }));

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria.map((c) => c.key)).not.toContain('profile_logo');
    }
  });
});
