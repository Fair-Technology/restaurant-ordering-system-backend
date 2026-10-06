import { describe, expect, it } from 'vitest';
import { buildOrderEmail } from '../../../src/application/order/notifications/emailTemplates';
import { ACCEPTED_CARD_ORDER, CARD_SHOP, LEGACY_CASH_ORDER, PLACED_CARD_ORDER, PLACED_TABLE_ORDER } from '../../fixtures/orders';

const customerOrderUrl = 'https://shop.example/shops/mapasta/orders/o1?t=TT';
const adminOrdersUrl = 'https://admin.example/shops/shop-1/orders';
const build = (kind: Parameters<typeof buildOrderEmail>[0]['kind'], order = PLACED_CARD_ORDER) =>
  buildOrderEmail({ kind, order, shop: CARD_SHOP, customerOrderUrl, adminOrdersUrl });

describe('order emails', () => {
  it('received email in German names the restaurant, total and cancel link', () => {
    const mail = build('order_received');
    expect(mail.subject).toBe('Ma Pasta: Bestellung AB3-K7P eingegangen');
    expect(mail.text).toContain('10,50 €');
    expect(mail.text).toContain('Betrag reserviert: 10,50 € – abgebucht wird erst, wenn Ma Pasta annimmt.');
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
    expect(mail.text).toContain('Es wurde nichts abgebucht.');
  });

  it('accepted email mentions the attached invoice', () => {
    const mail = buildOrderEmail({
      kind: 'order_accepted',
      order: ACCEPTED_CARD_ORDER,
      shop: CARD_SHOP,
      customerOrderUrl,
      adminOrdersUrl,
      attachedDocument: { title: 'Rechnung', number: 'R-2026-00001' },
    });
    expect(mail.text).toContain('Ihre Rechnung R-2026-00001 finden Sie im Anhang.');
  });

  it('refund email names the amount and the correction invoice', () => {
    const mail = buildOrderEmail({
      kind: 'order_refunded',
      order: { ...ACCEPTED_CARD_ORDER, refunds: [{ id: 'r1', amountCents: 300, reason: 'x', at: 'x', actor: { type: 'system' }, stripeRefundId: 're_1' }] },
      shop: CARD_SHOP,
      customerOrderUrl,
      adminOrdersUrl,
      attachedDocument: { title: 'Rechnungskorrektur', number: 'R-2026-00002' },
    });
    expect(mail.subject).toBe('Ma Pasta: Erstattung für Bestellung AB3-K7P');
    expect(mail.text).toContain('Wir haben Ihnen 3,00 € erstattet.');
    expect(mail.text).toContain('Ihre Rechnungskorrektur R-2026-00002 finden Sie im Anhang.');
  });

  it('old pay-at-collection orders get no money sentence', () => {
    const rejected = {
      ...LEGACY_CASH_ORDER,
      state: 'REJECTED' as const,
      history: [
        ...PLACED_CARD_ORDER.history,
        { from: 'PLACED' as const, to: 'REJECTED' as const, at: '2026-10-05T10:10:00.000Z', actor: { type: 'system' as const }, reason: 'no_response' },
      ],
    };
    const mail = build('order_rejected', rejected);
    expect(mail.text).not.toContain('abgebucht');
    expect(mail.text).not.toContain('erstatten');
    expect(build('order_received', LEGACY_CASH_ORDER).text).not.toContain('Betrag reserviert');
  });

  it('a failed capture explains itself', () => {
    const mail = build('order_rejected', {
      ...PLACED_CARD_ORDER,
      state: 'REJECTED',
      history: [
        ...PLACED_CARD_ORDER.history,
        { from: 'PLACED', to: 'REJECTED', at: '2026-10-05T10:05:00.000Z', actor: { type: 'staff', id: 's1' }, reason: 'payment_failed' },
      ],
    });
    expect(mail.text).toContain('Die Zahlung konnte bei der Annahme nicht abgeschlossen werden.');
  });

  it('a paid order that is declined promises a refund', () => {
    const mail = build('order_cancelled', { ...ACCEPTED_CARD_ORDER, state: 'CANCELLED' });
    expect(mail.text).toContain('Wir erstatten Ihnen den vollen Betrag von 10,50 €.');
  });

  it('tells the restaurant when a payment could not be released', () => {
    const mail = buildOrderEmail({
      kind: 'payment_release_failed',
      order: { ...PLACED_CARD_ORDER, releaseFailure: { at: 'x', message: 'API down', notifiedAt: null } },
      shop: CARD_SHOP,
      customerOrderUrl,
      adminOrdersUrl,
    });
    expect(mail.subject).toBe('Zahlung für Bestellung AB3-K7P konnte nicht freigegeben werden');
    expect(mail.text).toContain('Stripe meldet: API down.');
    expect(mail.text).toContain(adminOrdersUrl);
  });

  it("a table order's email names the table and leaves out the pickup address", () => {
    const mail = build('order_received', PLACED_TABLE_ORDER);
    expect(mail.text).toContain('Tisch: 7');
    expect(mail.text).not.toContain('Abholung:');
    expect(build('order_received').text).toContain('Abholung:');
  });

  it("a table order's ready email says ready, not collect", () => {
    const mail = build('order_ready', { ...PLACED_TABLE_ORDER, state: 'READY' });
    expect(mail.subject).toBe('Ma Pasta: Bestellung AB3-K7P ist fertig');
    expect(mail.text).toContain('Ihre Bestellung ist fertig.');
    expect(mail.text).not.toContain('abholbereit');
  });

  it('the waiting-order email names the table', () => {
    expect(build('order_escalation', PLACED_TABLE_ORDER).text).toContain('Tisch: 7');
  });
});
