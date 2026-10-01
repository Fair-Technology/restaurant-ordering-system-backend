import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  createCheckoutSession: vi.fn(),
}));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { executeCheckout } from '../../../src/application/order/checkout/executeCheckout';
import { CheckoutRequestDto } from '../../../src/application/order/checkout/dtos';

const baseRequest: CheckoutRequestDto = {
  shopId: 'shop-1',
  items: [{ productId: 'p1', quantity: 1 }],
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
};

describe('executeCheckout fulfilmentMode validation', () => {
  it('rejects an unknown mode', async () => {
    const res = await executeCheckout({ ...baseRequest, fulfilmentMode: 'teleport' as any });
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'fulfilmentMode must be one of collection, delivery, dine_in',
    });
    expect(findShopById).not.toHaveBeenCalled();
  });

  it('rejects delivery for now', async () => {
    const res = await executeCheckout({ ...baseRequest, fulfilmentMode: 'delivery' });
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Only collection orders are available at the moment',
    });
    expect(findShopById).not.toHaveBeenCalled();
  });
});

describe('executeCheckout menu declaration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a dish without an allergen declaration', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1',
      isDeleted: false,
      isPaused: false,
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
    });
    (findProductById as any).mockResolvedValue({
      id: 'p1',
      shopId: 'shop-1',
      name: 'Margherita',
      price: 900,
      isAvailable: true,
      isDeleted: false,
      allergenIds: null,
      additiveIds: null,
      schedule: null,
    });

    const res = await executeCheckout(baseRequest);

    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Product is not available: Margherita' });
  });
});
