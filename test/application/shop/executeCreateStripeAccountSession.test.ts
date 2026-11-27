import { describe, it, expect, vi, beforeEach } from 'vitest';

const stripeMock = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  createStripeClient: () => ({
    accounts: { create: stripeMock.create, retrieve: stripeMock.retrieve },
    accountSessions: { create: stripeMock.sessionCreate },
  }),
}));
vi.mock('../../../src/application/shop/_shared/registerStorefrontDomain', () => ({
  registerStorefrontDomain: vi.fn(async () => undefined),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeCreateStripeAccountSession } from '../../../src/application/shop/createStripeAccountSession/executeCreateStripeAccountSession';

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
    address: {},
    isDeleted: false,
    stripe: null,
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

const statusWrites = () =>
  (updateShop as any).mock.calls.map((c: any[]) => c[0].stripe?.connectOnboardingStatus);

describe('executeCreateStripeAccountSession onboarding status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateShop as any).mockImplementation(async (s: any) => s);
    stripeMock.sessionCreate.mockResolvedValue({ client_secret: 'cs_1' });
  });

  it('stores a freshly created account as not_started, not pending', async () => {
    (findShopById as any).mockResolvedValue(makeShop());
    stripeMock.create.mockResolvedValue({ id: 'acct_new' });
    stripeMock.retrieve.mockResolvedValue({ charges_enabled: false, details_submitted: false });

    const result = await executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(statusWrites()).toEqual(['not_started']);
    expect(statusWrites()).not.toContain('pending');
  });

  it('steps a stale pending back down to not_started', async () => {
    (findShopById as any).mockResolvedValue(
      makeShop({ stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'pending' } }),
    );
    stripeMock.retrieve.mockResolvedValue({ charges_enabled: false, details_submitted: false });

    await executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any);

    expect(statusWrites()).toEqual(['not_started']);
  });

  it('keeps complete sticky even if the live account says otherwise', async () => {
    (findShopById as any).mockResolvedValue(
      makeShop({ stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' } }),
    );
    stripeMock.retrieve.mockResolvedValue({ charges_enabled: false, details_submitted: true });

    const result = await executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).not.toHaveBeenCalled();
  });
});
