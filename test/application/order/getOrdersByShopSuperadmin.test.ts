import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCEPTED_DELIVERY_ORDER, DELIVERY_ADDRESS, DELIVERY_SHOP } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  authorizeShopAction: vi.fn(),
  findShopById: vi.fn(),
  findOrdersByShopIdPaginated: vi.fn(),
  countOrdersByShopId: vi.fn(),
  countOrdersByShopIdByState: vi.fn(),
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: m.authorizeShopAction }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersByShopIdPaginated: m.findOrdersByShopIdPaginated,
  countOrdersByShopId: m.countOrdersByShopId,
  countOrdersByShopIdByState: m.countOrdersByShopIdByState,
}));

import { executeGetOrdersByShop } from '../../../src/application/order/getOrdersByShop/executeGetOrdersByShop';

const order = { ...ACCEPTED_DELIVERY_ORDER, customerNotes: 'ring twice' };

beforeEach(() => {
  vi.resetAllMocks();
  m.findShopById.mockResolvedValue(DELIVERY_SHOP);
  m.findOrdersByShopIdPaginated.mockResolvedValue([order]);
  m.countOrdersByShopId.mockResolvedValue(1);
  m.countOrdersByShopIdByState.mockResolvedValue({ accepted: 1 });
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

describe('executeGetOrdersByShop state counts', () => {
  it('returns the per-state tally for the same window as total', async () => {
    m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType: 'owner', actorId: 'u1', role: null }, permissions: [] });
    m.countOrdersByShopId.mockResolvedValue(4);
    m.countOrdersByShopIdByState.mockResolvedValue({ accepted: 2, rejected: 1, cancelled: 1 });
    const FROM = '2026-11-16T00:00:00.000Z';
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id, from: FROM }, {} as any);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.total).toBe(4);
    expect(result.data.stateCounts).toEqual({ accepted: 2, rejected: 1, cancelled: 1 });
    expect(m.countOrdersByShopIdByState).toHaveBeenCalledWith(DELIVERY_SHOP.id, FROM, undefined);
  });
});

describe('executeGetOrdersByShop date filter', () => {
  const FROM = '2026-11-16T00:00:00.000Z';
  const TO = '2026-11-17T00:00:00.000Z';

  beforeEach(() => {
    m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType: 'owner', actorId: 'u1', role: null }, permissions: [] });
  });

  it('returns the day\'s orders with a total scoped to the same bounds', async () => {
    m.countOrdersByShopId.mockResolvedValue(1);
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id, from: FROM, to: '2026-11-17T02:00:00+02:00' }, {} as any);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.orders).toHaveLength(1);
    expect(result.data.orders[0].id).toBe(order.id);
    expect(result.data.total).toBe(1);
    expect(m.findOrdersByShopIdPaginated).toHaveBeenCalledWith(DELIVERY_SHOP.id, 1, 20, FROM, '2026-11-17T00:00:00.000Z');
    expect(m.countOrdersByShopId).toHaveBeenCalledWith(DELIVERY_SHOP.id, FROM, '2026-11-17T00:00:00.000Z');
  });

  it('returns an empty page, not the unfiltered list, for a day without orders', async () => {
    m.findOrdersByShopIdPaginated.mockResolvedValue([]);
    m.countOrdersByShopId.mockResolvedValue(0);
    m.countOrdersByShopIdByState.mockResolvedValue({});
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id, from: FROM, to: TO }, {} as any);
    expect(result).toEqual({ ok: true, data: { orders: [], total: 0, stateCounts: {}, page: 1, pageSize: 20 } });
  });

  it.each([
    ['from', { from: 'yesterday' }],
    ['to', { to: '2026-11-16' }],
    ['from', { from: '2026-13-45T00:00:00Z' }],
  ])('rejects an invalid %s with INVALID_INPUT before any repository call', async (_name, extra) => {
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id, ...extra }, {} as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_INPUT');
    expect(m.findOrdersByShopIdPaginated).not.toHaveBeenCalled();
    expect(m.countOrdersByShopId).not.toHaveBeenCalled();
  });

  it('treats blank values as absent', async () => {
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id, from: '  ', to: '' }, {} as any);
    expect(result.ok).toBe(true);
    expect(m.findOrdersByShopIdPaginated).toHaveBeenCalledWith(DELIVERY_SHOP.id, 1, 20, undefined, undefined);
  });

  it('without from/to keeps today\'s unfiltered behaviour and all-time total', async () => {
    m.countOrdersByShopId.mockResolvedValue(57);
    const result = await executeGetOrdersByShop({ shopId: DELIVERY_SHOP.id }, {} as any);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.total).toBe(57);
    expect(m.findOrdersByShopIdPaginated).toHaveBeenCalledWith(DELIVERY_SHOP.id, 1, 20, undefined, undefined);
    expect(m.countOrdersByShopId).toHaveBeenCalledWith(DELIVERY_SHOP.id, undefined, undefined);
  });
});
