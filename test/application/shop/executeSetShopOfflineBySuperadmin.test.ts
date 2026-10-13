import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersByShopIdAndStates: vi.fn(async () => []), findOrderWithEtag: vi.fn(), replaceOrderIfMatch: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null), createSlotPlaces: vi.fn(async () => 'ok'), replaceSlotPlacesIfMatch: vi.fn(async () => 'ok') }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  releaseAuthorization: vi.fn(async () => 'canceled'), createRefund: vi.fn(), findLiveRefund: vi.fn(async () => null) }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({ sendEmail: vi.fn(async () => undefined), emailTransportName: () => 'log' }));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetShopOfflineBySuperadmin } from '../../../src/application/shop/setShopOfflineBySuperadmin/executeSetShopOfflineBySuperadmin';
import { findOrderWithEtag, findOrdersByShopIdAndStates, replaceOrderIfMatch } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CARD_SHOP, orderStore, PLACED_CARD_ORDER, SCHEDULED_ORDER } from '../../fixtures/orders';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';

describe('executeSetShopOfflineBySuperadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findUserById as any).mockResolvedValue({ systemRole: 'superadmin' });
    (findOrdersByShopIdAndStates as any).mockResolvedValue([]);
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria', isPaused: false });
  });

  it('sets offline with a reason and audits it', async () => {
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true, reason: ' unpaid ' }, {} as any);
    expect(r).toMatchObject({ ok: true, data: { offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid' } });
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid' }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'shop.offline_by_superadmin', actorType: 'superadmin' }),
    );
  });

  it('clears offline and drops the reason', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'Pizzeria', offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid',
    });
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: false }, {} as any);
    expect(r.ok).toBe(true);
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.offlineBySuperadmin).toBe(false);
    expect('offlineBySuperadminReason' in saved).toBe(false);
  });

  it('refuses anyone who is not superadmin', async () => {
    (findUserById as any).mockResolvedValue({ systemRole: 'user' });
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('validates the body and finds the shop', async () => {
    expect(await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: 'x' as any }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT',
    });
    (findShopById as any).mockResolvedValue(null);
    expect(await executeSetShopOfflineBySuperadmin({ shopId: 'nope', offline: true }, {} as any)).toMatchObject({
      ok: false, code: 'NOT_FOUND',
    });
  });

  describe('waiting orders', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const useStore = (order: any) => {
      const store = orderStore(order);
      (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
      (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
      (findOrdersByShopIdAndStates as any).mockResolvedValue([order]);
      return store;
    };
    beforeEach(() => (findShopById as any).mockResolvedValue(CARD_SHOP));

    it('taking a shop offline declines its waiting booked order and releases the card', async () => {
      const store = useStore(SCHEDULED_ORDER);
      const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true }, {} as any, { now });
      expect(r.ok).toBe(true);
      expect(findOrdersByShopIdAndStates).toHaveBeenCalledWith('shop-1', ['PLACED']);
      expect(store.current.state).toBe('REJECTED');
      expect(store.current.history.at(-1)).toMatchObject({ actor: { type: 'system' }, reason: 'shop_unavailable' });
      expect(releaseAuthorization).toHaveBeenCalledWith({
        connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'release-o4',
      });
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'order_rejected' }));
    });

    it('an order whose payment is being taken right now is left alone', async () => {
      const store = useStore({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T09:59:30.000Z' });
      await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true }, {} as any, { now });
      expect(store.current.state).toBe('PLACED');
      expect(releaseAuthorization).not.toHaveBeenCalled();
    });

    it('bringing a shop back online declines nothing', async () => {
      await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: false }, {} as any, { now });
      expect(findOrdersByShopIdAndStates).not.toHaveBeenCalled();
    });

    it('a failing order lookup still takes the shop offline', async () => {
      (findOrdersByShopIdAndStates as any).mockRejectedValueOnce(new Error('down'));
      const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true }, {} as any, { now });
      expect(r.ok).toBe(true);
      expect(updateShop).toHaveBeenCalled();
    });
  });

  it('maps the new codes to 409 with a code in the body', () => {
    expect(mapResultToHttp({ ok: false, code: 'SHOP_OFFLINE_BY_SUPERADMIN', error: 'e' })).toMatchObject({
      status: 409, jsonBody: { code: 'SHOP_OFFLINE_BY_SUPERADMIN' },
    });
    expect(mapResultToHttp({ ok: false, code: 'ORDERS_PAUSED', error: 'e' })).toMatchObject({
      status: 409, jsonBody: { code: 'ORDERS_PAUSED' },
    });
    expect(mapResultToHttp({ ok: false, code: 'TAX_RATE_MISSING', error: 'e' })).toMatchObject({
      status: 409, jsonBody: { code: 'TAX_RATE_MISSING', error: 'e' },
    });
  });
});
