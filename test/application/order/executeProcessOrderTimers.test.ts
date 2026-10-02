import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findPlacedOrdersCreatedBefore: vi.fn(),
  findOrdersInState: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { executeProcessOrderTimers } from '../../../src/application/order/timers/executeProcessOrderTimers';
import {
  findOrderWithEtag,
  findOrdersInState,
  findPlacedOrdersCreatedBefore,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CASH_SHOP, PLACED_CASH_ORDER } from '../../fixtures/orders';

function storedOrder(order = PLACED_CASH_ORDER): void {
  (findOrderWithEtag as any).mockResolvedValue({ order, etag: 'etag-1' });
}

describe('executeProcessOrderTimers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CASH_SHOP);
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([PLACED_CASH_ORDER]);
    (findOrdersInState as any).mockResolvedValue([]);
    (replaceOrderIfMatch as any).mockResolvedValue('ok');
    storedOrder();
  });

  it('escalates an order waiting three minutes', async () => {
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:03:00Z') });
    expect((replaceOrderIfMatch as any).mock.calls[0][0].escalatedAt).toBe('2026-10-05T10:03:00.000Z');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['info@mapasta.example'],
        subject: 'Bestellung AB3-K7P wartet seit 3 Minuten auf Annahme',
      }),
    );
    expect(res).toEqual({ escalated: 1, autoRejected: 0, autoCompleted: 0 });
  });

  it('escalation also goes to the alert address', async () => {
    (findShopById as any).mockResolvedValue({
      ...CASH_SHOP,
      orderSettings: { autoRejectMinutes: 10, alertEmail: 'boss@mapasta.example' },
    });
    await executeProcessOrderTimers({ now: new Date('2026-10-05T10:03:00Z') });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['info@mapasta.example', 'boss@mapasta.example'] }),
    );
  });

  it('auto-rejects at the timeout', async () => {
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('REJECTED');
    expect(written.history.at(-1)).toMatchObject({ actor: { type: 'system' }, reason: 'no_response' });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P abgelehnt' }),
    );
    expect(res.autoRejected).toBe(1);
  });

  it('skips an order someone just accepted', async () => {
    (replaceOrderIfMatch as any).mockResolvedValue('conflict');
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    expect(res.autoRejected).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('completes a ready order after midnight', async () => {
    const ready = { ...PLACED_CASH_ORDER, state: 'READY' as const, readyAt: '2026-10-05T19:00:00.000Z' };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersInState as any).mockResolvedValue([ready]);
    storedOrder(ready);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T22:00:00Z') });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('COMPLETED');
    expect(written.payment.status).toBe('cash_due');
    expect(res.autoCompleted).toBe(1);
  });
});
