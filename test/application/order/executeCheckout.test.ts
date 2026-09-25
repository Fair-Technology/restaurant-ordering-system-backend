import { describe, it, expect, vi } from 'vitest';

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
