import { describe, expect, it } from 'vitest';
import { buildOrderEmail } from '../../../src/application/order/notifications/emailTemplates';
import { CARD_SHOP, PLACED_CARD_ORDER } from '../../fixtures/orders';

const customerOrderUrl = 'https://shop.example/shops/mapasta/orders/o1?t=TT';
const adminOrdersUrl = 'https://admin.example/shops/shop-1/orders';
const build = (kind: Parameters<typeof buildOrderEmail>[0]['kind'], order = PLACED_CARD_ORDER) =>
  buildOrderEmail({ kind, order, shop: CARD_SHOP, customerOrderUrl, adminOrdersUrl });

describe('order emails', () => {
  it('received email in German names the restaurant, total and cancel link', () => {
    const mail = build('order_received');
    expect(mail.subject).toBe('Ma Pasta: Bestellung AB3-K7P eingegangen');
    expect(mail.text).toContain('10,50 €');
    expect(mail.text).toContain('Zahlung: bei Abholung');
    expect(mail.text).toContain('Bestellung ansehen oder stornieren: https://shop.example/shops/mapasta/orders/o1?t=TT');
    expect(mail.text).toContain('Anbieter: Ma Pasta GmbH');
  });

  it("English accepted email shows the ready time in the restaurant's time zone", () => {
    const mail = build('order_accepted', {
      ...PLACED_CARD_ORDER,
      language: 'en',
      state: 'ACCEPTED',
      readyAt: '2026-10-05T10:25:00.000Z',
    });
    expect(mail.subject).toBe('Ma Pasta: order AB3-K7P accepted – ready at 12:25');
  });

  it('escapes HTML in customer-typed text', () => {
    const mail = build('order_received', { ...PLACED_CARD_ORDER, customerName: '<b>x</b>' });
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('automatic decline explains itself', () => {
    const mail = build('order_rejected', {
      ...PLACED_CARD_ORDER,
      state: 'REJECTED',
      history: [
        ...PLACED_CARD_ORDER.history,
        { from: 'PLACED', to: 'REJECTED', at: '2026-10-05T10:10:00.000Z', actor: { type: 'system' }, reason: 'no_response' },
      ],
    });
    expect(mail.text).toContain('Das Restaurant hat Ihre Bestellung nicht rechtzeitig bestätigt.');
    expect(mail.text).toContain('Es wurde nichts berechnet.');
  });
});
