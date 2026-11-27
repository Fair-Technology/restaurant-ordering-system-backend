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
  publicShopUrl: () => 'https://shop.example/shops/test',
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
    expect(stripeMock.create.mock.calls[0][0].business_profile).toMatchObject({
      url: 'https://shop.example/shops/test',
    });
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

describe('executeCreateStripeAccountSession idempotent account creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateShop as any).mockImplementation(async (s: any) => s);
    stripeMock.sessionCreate.mockResolvedValue({ client_secret: 'cs_1' });
    stripeMock.retrieve.mockResolvedValue({ charges_enabled: false, details_submitted: false });
  });

  it('passes an idempotency key derived from the shop id and generation 0', async () => {
    (findShopById as any).mockResolvedValue(makeShop());
    stripeMock.create.mockResolvedValue({ id: 'acct_new' });

    await executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any);

    expect(stripeMock.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'connect-account:shop-1:0' });
  });

  it('two concurrent calls for a shop with no account store the same account id', async () => {
    (findShopById as any).mockResolvedValue(makeShop());
    // Real Stripe returns the original account for a repeated idempotency key.
    stripeMock.create.mockResolvedValue({ id: 'acct_same' });

    const [a, b] = await Promise.all([
      executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any),
      executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const keys = stripeMock.create.mock.calls.map((c: any[]) => c[1].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    const ids = (updateShop as any).mock.calls.map((c: any[]) => c[0].stripe.connectAccountId);
    expect(new Set(ids)).toEqual(new Set(['acct_same']));
  });

  it('uses a different key for a later generation', async () => {
    (findShopById as any).mockResolvedValue(makeShop({ stripe: { connectAccountGeneration: 1 } }));
    stripeMock.create.mockResolvedValue({ id: 'acct_fresh' });

    await executeCreateStripeAccountSession({ shopId: 'shop-1' } as any, {} as any);

    expect(stripeMock.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'connect-account:shop-1:1' });
    expect(stripeMock.create.mock.calls[0][1].idempotencyKey).not.toBe('connect-account:shop-1:0');
  });
});
