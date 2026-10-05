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
vi.mock('../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', async () => {
  const { COMPLETE_IDENTITY } = await import('../../fixtures/legal');
  return { getPlatformLegalIdentity: vi.fn(async () => COMPLETE_IDENTITY) };
});

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { getPlatformLegalIdentity } from '../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { DEFAULT_PLATFORM_LEGAL_IDENTITY } from '../../../src/domain/legal/PlatformLegalIdentity';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
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

  it('stripe is required: unmet without completed onboarding', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ stripe: null }));

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const criterion = result.data.criteria.find((c) => c.key === 'stripe_connected');
      expect(criterion?.met).toBe(false);
      expect(criterion?.description).toBe('Connect Stripe — every order is paid online');
    }
  });

  it('stripe is met with completed onboarding', async () => {
    (findShopById as any).mockResolvedValue(
      makeShop({ stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' } }),
    );

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria.find((c) => c.key === 'stripe_connected')?.met).toBe(true);
    }
  });

  it('a tax number or VAT ID is a criterion', async () => {
    const noVat = { ...COMPLETE_LEGAL, impressum: { ...COMPLETE_LEGAL.impressum!, vatId: '' } };
    const met = async (shop: any) => {
      (findShopById as any).mockResolvedValue(shop);
      const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);
      if (!result.ok) throw new Error('expected ok');
      return result.data.criteria.find((c) => c.key === 'invoice_tax_id')?.met;
    };

    expect(await met(makeShop({ legal: COMPLETE_LEGAL }))).toBe(true);
    expect(await met(makeShop({ legal: { ...noVat, taxNumber: '045/123/45678' } }))).toBe(true);
    expect(await met(makeShop({ legal: noVat }))).toBe(false);
    expect(await met(makeShop())).toBe(false);
  });

  it('all met only when a tax ID is set too', async () => {
    (findProductsByShopId as any).mockResolvedValue([
      { isAvailable: true, isDeleted: false, allergenIds: [], additiveIds: [] },
    ]);
    (findCategoriesByShopId as any).mockResolvedValue([{ isDeleted: false }]);
    const noVat = { ...COMPLETE_LEGAL, impressum: { ...COMPLETE_LEGAL.impressum!, vatId: '' } };
    const ready = (legal: any) =>
      makeShop({
        legal,
        dpaAcceptance: ACCEPTED_DPA,
        stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
        address: { street: 'S 1', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Germany' },
        openingHours: { mon: [{ open: '09:00', close: '17:00' }] },
      });
    const allMet = async (shop: any) => {
      (findShopById as any).mockResolvedValue(shop);
      const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);
      if (!result.ok) throw new Error('expected ok');
      return result.data.allMet;
    };

    expect(await allMet(ready(COMPLETE_LEGAL))).toBe(true);
    expect(await allMet(ready(noVat))).toBe(false);
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

describe('executeGetGoLiveStatus legal criteria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('lists the legal criteria after the existing six, then the invoice tax id', async () => {
    (findShopById as any).mockResolvedValue(makeShop());

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria.map((c) => c.key)).toEqual([
        'stripe_connected',
        'has_products',
        'has_categories',
        'profile_name',
        'profile_address',
        'opening_hours',
        'dpa_accepted',
        'impressum',
        'terms',
        'withdrawal',
        'privacy_notice',
        'invoice_tax_id',
      ]);
    }
  });

  it('privacy_notice is unmet while the platform identity is incomplete', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ legal: COMPLETE_LEGAL }));
    (getPlatformLegalIdentity as any).mockResolvedValueOnce(DEFAULT_PLATFORM_LEGAL_IDENTITY);

    const result = await executeGetGoLiveStatus({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const byKey = Object.fromEntries(result.data.criteria.map((c) => [c.key, c.met]));
      expect(byKey.privacy_notice).toBe(false);
      expect(byKey.impressum).toBe(true);
    }
  });
});
