import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeDisconnectStripeAccount } from '../../../src/application/shop/disconnectStripeAccount/executeDisconnectStripeAccount';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_billing'],
};

function makeShop(overrides: any = {}) {
  return {
    id: 'shop-1',
    name: 'Pizzeria',
    slug: 'p',
    isDeleted: false,
    isPaused: false,
    stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

describe('executeDisconnectStripeAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('disconnecting Stripe takes the shop offline', async () => {
    (findShopById as any).mockResolvedValue(makeShop());

    const result = await executeDisconnectStripeAccount({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ stripe: null, isPaused: true }));
  });
});
