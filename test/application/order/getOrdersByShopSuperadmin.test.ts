import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCEPTED_DELIVERY_ORDER, DELIVERY_ADDRESS, DELIVERY_SHOP } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  authorizeShopAction: vi.fn(),
  findShopById: vi.fn(),
  findOrdersByShopIdPaginated: vi.fn(),
  countOrdersByShopId: vi.fn(),
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: m.authorizeShopAction }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersByShopIdPaginated: m.findOrdersByShopIdPaginated,
  countOrdersByShopId: m.countOrdersByShopId,
}));

import { executeGetOrdersByShop } from '../../../src/application/order/getOrdersByShop/executeGetOrdersByShop';

const order = { ...ACCEPTED_DELIVERY_ORDER, customerNotes: 'ring twice' };

beforeEach(() => {
  vi.resetAllMocks();
  m.findShopById.mockResolvedValue(DELIVERY_SHOP);
  m.findOrdersByShopIdPaginated.mockResolvedValue([order]);
  m.countOrdersByShopId.mockResolvedValue(1);
});

async function listAs(actorType: 'owner' | 'superadmin') {
  m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType, actorId: 'u1', role: null }, permissions: [] });
  const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id }, {} as any);
  if (!result.ok) throw new Error('expected ok');
  return result.data.orders[0];
}

describe('executeGetOrdersByShop personal data', () => {
  it('gives the owner the delivery address and contact details', async () => {
    const dto = await listAs('owner');
    expect(dto.deliveryAddress).toEqual(DELIVERY_ADDRESS);
    expect(dto.customerEmail).toBe(order.customerEmail);
    expect(dto.customerPhone).toBe(order.customerPhone);
    expect(dto.customerNotes).toBe('ring twice');
  });

  it('keeps the delivery address and contact details out of the superadmin response', async () => {
    const dto = await listAs('superadmin');
    expect(dto.deliveryAddress).toBeNull();
    expect(dto.customerAddress).toBeNull();
    expect(dto.customerEmail).toBe('');
    expect(dto.customerPhone).toBe('');
    expect(dto.customerNotes).toBeUndefined();
    expect(dto.customerName).toBe(order.customerName);
    expect(dto.totalCents).toBe(1300);
    expect(JSON.stringify(dto)).not.toContain('Teststraße');
  });
});
