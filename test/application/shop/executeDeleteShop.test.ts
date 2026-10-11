import { describe, it, expect, vi, beforeEach } from 'vitest';

const stripeCancel = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    subscriptions = { cancel: stripeCancel };
  },
}));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  countOpenOrdersByShopId: vi.fn(async () => 0),
}));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-free' })),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { countOpenOrdersByShopId } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeDeleteShop } from '../../../src/application/shop/deleteShop/executeDeleteShop';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';

const PAID = {
  id: 'shop-1',
  shopId: 'shop-1',
  planId: 'plan-pro',
  status: 'active',
  billingSubscriptionId: 'sub_123',
  cancelAtPeriodEnd: false,
  planSource: 'billing',
  overrideExpiresAt: null,
};

function actor(actorType: 'owner' | 'staff' | 'superadmin', actorId = 'u1') {
  (authorizeShopAction as any).mockResolvedValue({
    ok: true,
    actor: { actorType, actorId, role: actorType === 'staff' ? 'manager' : actorType },
    permissions: ['manage_shop'],
  });
}

describe('executeDeleteShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    actor('owner');
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria', isDeleted: false, members: [] });
    (countOpenOrdersByShopId as any).mockResolvedValue(0);
    (findSubscriptionByShopId as any).mockResolvedValue(null);
    stripeCancel.mockResolvedValue({});
  });

  it('owner deletes: flags, timestamp, who, and an audit entry', async () => {
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toEqual({ ok: true, data: { success: true } });
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved).toMatchObject({ isDeleted: true, deletedBy: 'u1' });
    expect(typeof saved.deletedAt).toBe('string');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.delete', shopId: 'shop-1', actorId: 'u1' }));
    expect(stripeCancel).not.toHaveBeenCalled();
  });

  it('superadmin may delete', async () => {
    actor('superadmin', 'sa');
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r.ok).toBe(true);
    expect((updateShop as any).mock.calls[0][0].deletedBy).toBe('sa');
  });

  it('manager is refused with 403 and nothing changes', async () => {
    actor('staff');
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(mapResultToHttp(r).status).toBe(403);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses with 409 OPEN_ORDERS while orders are in progress', async () => {
    (countOpenOrdersByShopId as any).mockResolvedValue(2);
    (findSubscriptionByShopId as any).mockResolvedValue(PAID);
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'OPEN_ORDERS' });
    const http = mapResultToHttp(r);
    expect(http.status).toBe(409);
    expect((http.jsonBody as any).code).toBe('OPEN_ORDERS');
    expect(stripeCancel).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('cancels the subscription immediately and records it like the webhook does', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(PAID);
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r.ok).toBe(true);
    expect(stripeCancel).toHaveBeenCalledWith('sub_123');
    const sub = (upsertSubscription as any).mock.calls[0][0];
    expect(sub).toMatchObject({ status: 'expired', billingSubscriptionId: null, cancelAtPeriodEnd: false, planId: 'plan-free' });
    expect(updateShop).toHaveBeenCalled();
  });

  it('Stripe failure: nothing is deleted', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(PAID);
    stripeCancel.mockRejectedValue(new Error('stripe down'));
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(updateShop).not.toHaveBeenCalled();
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('a subscription already gone on Stripe does not block the delete', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(PAID);
    stripeCancel.mockRejectedValue(Object.assign(new Error('no such'), { code: 'resource_missing' }));
    const r = await executeDeleteShop({ shopId: 'shop-1' }, {} as any);
    expect(r.ok).toBe(true);
  });

  it('already deleted or unknown shop is 404', async () => {
    (findShopById as any).mockResolvedValue({ id: 'shop-1', isDeleted: true });
    expect(await executeDeleteShop({ shopId: 'shop-1' }, {} as any)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    (findShopById as any).mockResolvedValue(null);
    expect(await executeDeleteShop({ shopId: 'shop-1' }, {} as any)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
