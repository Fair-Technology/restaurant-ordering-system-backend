import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutSession } from '../../../src/domain/order/CheckoutSession';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionsWrittenBetween: vi.fn(),
  deleteCheckoutSession: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findOrderById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({ releaseAuthorization: vi.fn() }));
vi.mock('../../../src/application/order/_shared/slotPlaces', () => ({ releaseSlotPlace: vi.fn(async () => undefined) }));
vi.mock('../../../src/application/order/reconcile/reconcileCheckoutSession', () => ({ reconcileCheckoutSession: vi.fn() }));

import { executeReconcileCheckouts } from '../../../src/application/order/reconcile/executeReconcileCheckouts';
import { reconcileCheckoutSession } from '../../../src/application/order/reconcile/reconcileCheckoutSession';
import { releaseSlotPlace } from '../../../src/application/order/_shared/slotPlaces';
import { deleteCheckoutSession, findCheckoutSessionsWrittenBetween } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { CARD_SHOP, NOW_OPEN } from '../../fixtures/orders';

const NOW = NOW_OPEN;
const S = { id: 'sess-1', shopId: 'shop-1', stripePaymentIntentId: 'pi_1', _ts: 1791194400 - 600 } as CheckoutSession;
const old = (extra: Partial<CheckoutSession> = {}, age = 2700) => ({ ...S, _ts: 1791194400 - age, ...extra }) as CheckoutSession;

describe('executeReconcileCheckouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([S]);
    (findOrderById as any).mockResolvedValue(null);
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (releaseAuthorization as any).mockResolvedValue('canceled');
    (reconcileCheckoutSession as any).mockReset();
    (reconcileCheckoutSession as any).mockResolvedValue('created');
  });

  it('looks at checkouts written 2 to 60 minutes ago', async () => {
    const res = await executeReconcileCheckouts({ now: NOW });
    expect(findCheckoutSessionsWrittenBetween).toHaveBeenCalledWith(1791190800, 1791194280);
    expect(reconcileCheckoutSession).toHaveBeenCalledWith({ session: S, now: NOW, source: 'sweep' });
    expect(res).toEqual({ checked: 1, converted: 1, released: 0, failed: 0 });
  });

  it('one failing checkout does not stop the rest', async () => {
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([S, { ...S, id: 'sess-2' }]);
    (reconcileCheckoutSession as any).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('created');
    expect(await executeReconcileCheckouts({ now: NOW })).toEqual({ checked: 2, converted: 1, released: 0, failed: 1 });
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('gives up after 45 minutes: card released, checkout removed', async () => {
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([old()]);
    (reconcileCheckoutSession as any).mockRejectedValue(new Error('x'));
    const res = await executeReconcileCheckouts({ now: NOW });
    expect(releaseAuthorization).toHaveBeenCalledWith({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'release-orphan-pi_1' });
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
    expect(res.released).toBe(1);

    vi.clearAllMocks();
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([old({}, 2699)]);
    await executeReconcileCheckouts({ now: NOW });
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('never releases a payment that already has its order', async () => {
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([old()]);
    (reconcileCheckoutSession as any).mockRejectedValue(new Error('x'));
    (findOrderById as any).mockResolvedValue({ id: 'sess-1' });
    await executeReconcileCheckouts({ now: NOW });
    expect(releaseAuthorization).not.toHaveBeenCalled();
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
  });

  it('money already taken is left for a human', async () => {
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([old()]);
    (reconcileCheckoutSession as any).mockRejectedValue(new Error('x'));
    (releaseAuthorization as any).mockResolvedValue('already_captured');
    const res = await executeReconcileCheckouts({ now: NOW });
    expect(deleteCheckoutSession).not.toHaveBeenCalled();
    expect(res.released).toBe(0);
  });

  it('a booked checkout frees its place when given up', async () => {
    (findCheckoutSessionsWrittenBetween as any).mockResolvedValue([old({ scheduledFor: '2026-10-05T16:00:00.000Z' })]);
    (reconcileCheckoutSession as any).mockRejectedValue(new Error('x'));
    await executeReconcileCheckouts({ now: NOW });
    expect(releaseSlotPlace).toHaveBeenCalledWith({ shop: CARD_SHOP, order: { id: 'sess-1', scheduledFor: '2026-10-05T16:00:00.000Z' }, now: NOW });
  });
});
