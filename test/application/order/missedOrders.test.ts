import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/usage/CosmosMissedOrdersRepository', () => ({
  incrementMissedStreak: vi.fn(),
  resetMissedStreak: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  patchShopFields: vi.fn(async () => undefined),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({ sendEmail: vi.fn(async () => undefined), emailTransportName: () => 'log' }));

import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { recordMissedOrder, resetMissedOrderStreak } from '../../../src/application/order/_shared/missedOrders';
import { escalationRecipients } from '../../../src/domain/order/orderSettings';
import { findShopById, patchShopFields } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { incrementMissedStreak, resetMissedStreak } from '../../../src/infrastructure/cosmos/usage/CosmosMissedOrdersRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CARD_SHOP } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:10:00Z');
const NOW_ISO = '2026-10-05T10:10:00.000Z';

describe('recordMissedOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });

  it('limit off: nothing is counted', async () => {
    expect(await recordMissedOrder({ ...CARD_SHOP, missedOrdersPauseLimit: 0 }, now)).toBeNull();
    expect(incrementMissedStreak).not.toHaveBeenCalled();
  });

  it('below the limit only counts', async () => {
    (incrementMissedStreak as any).mockResolvedValue(2);
    expect(await recordMissedOrder(CARD_SHOP, now)).toBeNull();
    expect(patchShopFields).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('the third miss in a row pauses until switched back, emails the owner, starts the count again', async () => {
    (incrementMissedStreak as any).mockResolvedValue(3);
    const res = await recordMissedOrder(CARD_SHOP, now);
    expect(patchShopFields).toHaveBeenCalledWith('shop-1', {
      ordersPaused: true,
      ordersPausedUntil: null,
      ordersAutoPaused: { missedOrders: 3, at: NOW_ISO },
      updatedAt: NOW_ISO,
    });
    expect(resetMissedStreak).toHaveBeenCalledWith('shop-1', now);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: 'orders_auto_paused',
        to: escalationRecipients(CARD_SHOP),
        subject: 'Bestellungen pausiert: 3 Bestellungen in Folge nicht rechtzeitig angenommen',
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.orders_auto_paused', actorType: 'system' }));
    expect(res?.ordersPaused).toBe(true);
  });

  it('one missed order with the limit at 1', async () => {
    (incrementMissedStreak as any).mockResolvedValue(1);
    await recordMissedOrder({ ...CARD_SHOP, missedOrdersPauseLimit: 1 }, now);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Bestellungen pausiert: 1 Bestellung nicht rechtzeitig angenommen' }),
    );
  });

  it('English shop gets the English email', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, menuLanguages: ['en'] });
    (incrementMissedStreak as any).mockResolvedValue(3);
    await recordMissedOrder(CARD_SHOP, now);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Orders paused: 3 orders in a row were not accepted in time' }),
    );
  });

  it('a shop already paused is left alone', async () => {
    (incrementMissedStreak as any).mockResolvedValue(3);
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, ordersPaused: true });
    expect(await recordMissedOrder(CARD_SHOP, now)).toBeNull();
    expect(patchShopFields).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(resetMissedStreak).not.toHaveBeenCalled();
  });

  it('an expired timed pause does not stop the auto-pause', async () => {
    (incrementMissedStreak as any).mockResolvedValue(3);
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, ordersPaused: true, ordersPausedUntil: '2026-10-05T10:00:00.000Z' });
    await recordMissedOrder(CARD_SHOP, now);
    expect(patchShopFields).toHaveBeenCalled();
  });

  it('an offline shop is left alone', async () => {
    (incrementMissedStreak as any).mockResolvedValue(3);
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, isPaused: true });
    expect(await recordMissedOrder(CARD_SHOP, now)).toBeNull();
    expect(patchShopFields).not.toHaveBeenCalled();
  });

  it('over the limit still pauses', async () => {
    (incrementMissedStreak as any).mockResolvedValue(5);
    const res = await recordMissedOrder(CARD_SHOP, now);
    expect(res?.ordersAutoPaused?.missedOrders).toBe(5);
  });

  it('a counting failure never throws', async () => {
    (incrementMissedStreak as any).mockRejectedValue(new Error('down'));
    await expect(recordMissedOrder(CARD_SHOP, now)).resolves.toBeNull();
  });

  it('a reset failure never throws', async () => {
    (resetMissedStreak as any).mockRejectedValueOnce(new Error('down'));
    await expect(resetMissedOrderStreak('shop-1', now)).resolves.toBeUndefined();
  });
});
