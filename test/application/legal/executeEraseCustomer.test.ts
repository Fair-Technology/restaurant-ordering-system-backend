import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersByShopIdAndCustomerEmail: vi.fn(),
  replaceOrder: vi.fn(async (o: any) => o),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findOrdersByShopIdAndCustomerEmail,
  replaceOrder,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeEraseCustomer } from '../../../src/application/legal/eraseCustomer/executeEraseCustomer';

const now = new Date('2026-10-05T00:00:00Z');
const o1 = {
  id: 'o1', shopId: 'shop-1', state: 'COMPLETED', orderRef: 'AAA-111', customerName: 'Anna A',
  customerEmail: 'Anna@Example.com', customerPhone: '111', customerNotes: 'no nuts', createdAt: '2026-10-01T10:00:00Z',
};
const o2 = {
  id: 'o2', shopId: 'shop-1', state: 'COMPLETED', orderRef: 'BBB-222', customerName: 'Anna B',
  customerEmail: 'anna@example.com', customerPhone: '222', createdAt: '2026-10-02T10:00:00Z',
};

describe('executeEraseCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
      permissions: [],
    });
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria', isDeleted: false, members: [] });
    (findOrdersByShopIdAndCustomerEmail as any).mockResolvedValue([o1, o2]);
    (replaceOrder as any).mockImplementation(async (o: any) => o);
  });

  it('anonymises every matching order regardless of email case', async () => {
    const r = await executeEraseCustomer({ shopId: 'shop-1', email: ' ANNA@example.com ', now }, {} as any);
    expect(findOrdersByShopIdAndCustomerEmail).toHaveBeenCalledWith('shop-1', 'anna@example.com');
    expect(replaceOrder).toHaveBeenCalledTimes(2);
    for (const [order] of (replaceOrder as any).mock.calls) {
      expect(order).toMatchObject({
        customerName: 'Deleted customer', customerEmail: '', customerPhone: '',
        anonymisedAt: '2026-10-05T00:00:00.000Z',
      });
      expect('customerNotes' in order).toBe(false);
    }
    expect(r).toEqual({ ok: true, data: { anonymisedOrderCount: 2 } });
  });

  it('refuses while the customer has an open order', async () => {
    (findOrdersByShopIdAndCustomerEmail as any).mockResolvedValue([o1, { ...o2, state: 'ACCEPTED', orderRef: 'AB3-K7P' }]);
    const r = await executeEraseCustomer({ shopId: 'shop-1', email: 'anna@example.com', now }, {} as any);
    expect(r).toEqual({
      ok: false,
      code: 'CONFLICT',
      error: 'This customer has an open order (AB3-K7P). Finish or cancel it first.',
    });
    expect(replaceOrder).not.toHaveBeenCalled();
  });

  it('no match returns zero', async () => {
    (findOrdersByShopIdAndCustomerEmail as any).mockResolvedValue([]);
    const r = await executeEraseCustomer({ shopId: 'shop-1', email: 'x@y.example', now }, {} as any);
    expect(r).toEqual({ ok: true, data: { anonymisedOrderCount: 0 } });
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('audit entry holds no email', async () => {
    await executeEraseCustomer({ shopId: 'shop-1', email: 'anna@example.com', now }, {} as any);
    expect(JSON.stringify((logAudit as any).mock.calls[0][0])).not.toContain('anna');
  });

  it('refuses a non-owner', async () => {
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'staff', actorId: 's1', role: 'manager' },
      permissions: [],
    });
    const r = await executeEraseCustomer({ shopId: 'shop-1', email: 'anna@example.com', now }, {} as any);
    expect(r).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Only the restaurant owner can do this' });
  });

  it('rejects a malformed email', async () => {
    const r = await executeEraseCustomer({ shopId: 'shop-1', email: 'nope', now }, {} as any);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'email must be a valid email address' });
  });
});
