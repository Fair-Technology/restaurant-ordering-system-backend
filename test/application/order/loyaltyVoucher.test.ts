import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({
  findPromotions: vi.fn(),
  createVoucher: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  countLoyaltyOrders: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { issueLoyaltyVoucher } from '../../../src/application/order/loyalty/issueLoyaltyVoucher';
import {
  countLoyaltyOrders,
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { createVoucher, findPromotions } from '../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { ACCEPTED_CARD_ORDER, CARD_SHOP, orderStore, PROMOTIONS } from '../../fixtures/orders';

const OPTED = { ...ACCEPTED_CARD_ORDER, loyaltyOptIn: true as const };
const now = new Date('2026-10-09T10:00:00Z');
const code = () => 'L-ABCD2345';
const ISSUED = { code: 'L-ZZZZZZZZ', issuedAt: 'x' };

let store: ReturnType<typeof orderStore>;
function wire(order: typeof OPTED | typeof ACCEPTED_CARD_ORDER) {
  store = orderStore(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
}

describe('issueLoyaltyVoucher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findPromotions as any).mockResolvedValue(PROMOTIONS);
    (countLoyaltyOrders as any).mockResolvedValue(5);
    (createVoucher as any).mockResolvedValue(undefined);
    (sendEmail as any).mockResolvedValue(undefined);
    wire(OPTED);
  });

  it('every fifth accepted order earns a voucher', async () => {
    await issueLoyaltyVoucher(OPTED, CARD_SHOP, now, code);
    expect(countLoyaltyOrders).toHaveBeenCalledWith('shop-1', 'a@example.com', '2026-10-01T00:00:00.000Z');
    expect(createVoucher).toHaveBeenCalledWith({
      id: 'voucher_shop-1_L-ABCD2345',
      kind: 'loyalty_voucher',
      shopId: 'shop-1',
      code: 'L-ABCD2345',
      amountCents: 500,
      expiresOn: '2027-01-07',
      sourceOrderId: 'o1',
      createdAt: '2026-10-09T10:00:00.000Z',
    });
    expect(store.current.loyaltyVoucher).toEqual({ code: 'L-ABCD2345', issuedAt: '2026-10-09T10:00:00.000Z' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@example.com'],
        subject: expect.stringMatching(/^Ma Pasta: Ihr Gutschein über 5,00\u00a0€$/),
        tag: 'loyalty_voucher',
        text: expect.stringContaining('Ihr Gutscheincode: L-ABCD2345'),
      }),
    );
    const text: string = (sendEmail as any).mock.calls[0][0].text;
    expect(text).toContain('danke für Ihre 5. Bestellung bei Ma Pasta!');
    expect(text).toContain('Gültig bis einschließlich 7. Januar 2027.');
    expect(text).toContain('Jetzt bestellen: http://localhost:5175/shops/mapasta');
    expect(text).toContain('weil Sie bei Ihrer Bestellung AB3-K7P zugestimmt haben');
  });

  it('other orders earn nothing', async () => {
    (countLoyaltyOrders as any).mockResolvedValue(4);
    await issueLoyaltyVoucher(OPTED, CARD_SHOP, now, code);
    expect(createVoucher).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('no tick, no voucher', async () => {
    await issueLoyaltyVoucher(ACCEPTED_CARD_ORDER, CARD_SHOP, now, code);
    expect(findPromotions).not.toHaveBeenCalled();
  });

  it('loyalty switched off earns nothing', async () => {
    (findPromotions as any).mockResolvedValue({ ...PROMOTIONS, loyalty: { ...PROMOTIONS.loyalty!, enabled: false } });
    await issueLoyaltyVoucher(OPTED, CARD_SHOP, now, code);
    expect(countLoyaltyOrders).not.toHaveBeenCalled();
  });

  it('a voucher is issued once per order', async () => {
    await issueLoyaltyVoucher({ ...OPTED, loyaltyVoucher: ISSUED }, CARD_SHOP, now, code);
    expect(findPromotions).not.toHaveBeenCalled();
    expect(createVoucher).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('another acceptance got there first', async () => {
    wire({ ...OPTED, loyaltyVoucher: ISSUED } as typeof OPTED);
    await issueLoyaltyVoucher(OPTED, CARD_SHOP, now, code);
    expect(createVoucher).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.current.loyaltyVoucher?.code).toBe('L-ZZZZZZZZ');
  });

  it('an erased diner gets nothing', async () => {
    await issueLoyaltyVoucher({ ...OPTED, customerEmail: '' }, CARD_SHOP, now, code);
    expect(findPromotions).not.toHaveBeenCalled();
    expect(createVoucher).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('a failure never undoes the acceptance', async () => {
    (countLoyaltyOrders as any).mockRejectedValue(new Error('db'));
    await expect(issueLoyaltyVoucher(OPTED, CARD_SHOP, now, code)).resolves.toBeUndefined();
  });

  it('English voucher email', async () => {
    const english = { ...OPTED, language: 'en' as const };
    wire(english);
    await issueLoyaltyVoucher(english, CARD_SHOP, now, code);
    expect((sendEmail as any).mock.calls[0][0].subject).toBe('Ma Pasta: your voucher for \u20ac5.00');
  });
});
