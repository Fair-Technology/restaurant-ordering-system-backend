import { describe, expect, it } from 'vitest';
import {
  INVOICE_TAX_ID_MISSING,
  buildCorrection,
  buildInvoice,
  formatInvoiceNumber,
  invoiceFileName,
  invoiceTextLines,
  nextSequence,
  toWinAnsi,
  yearKeyOf,
} from '../../src/domain/invoice/invoice';
import type { Order } from '../../src/domain/order/Order';
import { extractVatCents } from '../../src/domain/order/tax';
import type { Shop } from '../../src/domain/shop/Shop';
import { priceBasket } from '../../src/application/order/_shared/priceBasket';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';
import { ACCEPTED_CARD_ORDER, ACCEPTED_DELIVERY_ORDER, ADDRESS, CARD_SHOP, CATEGORIES, DELIVERY_ADDRESS, DISCOUNTED_ORDER, FEE_CHARGE, P_PASTA } from '../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const NUMBER = 'R-2026-00001';

const TWO_LINE_ORDER: Order = {
  ...ACCEPTED_CARD_ORDER,
  items: [
    ACCEPTED_CARD_ORDER.items[0],
    {
      productId: 'p2',
      productName: 'Cola',
      quantity: 1,
      unitPriceCents: 350,
      lineTotalCents: 350,
      taxClassId: 'beverage',
      taxRateBasisPoints: 1900,
      taxCents: 56,
    },
  ],
  subtotalCents: 1400,
  taxBreakdown: [
    { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
    { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
  ],
};

const one = () =>
  buildInvoice({
    order: ACCEPTED_CARD_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  });
const two = () =>
  buildInvoice({ order: TWO_LINE_ORDER, shop: CARD_SHOP, number: NUMBER, now });
const text = (inv: ReturnType<typeof one>): string => {
  const t = invoiceTextLines(inv);
  return [
    t.title,
    ...t.seller,
    ...t.buyer,
    ...t.meta,
    ...t.items.map((i) => `${i.text} ${i.unit} ${i.total} ${i.rate}`),
    ...t.totals,
    ...t.footer,
  ]
    .join('\n')
    .replace(/ | /g, ' ');
};
const correct = (
  refunds: Array<{ amountCents: number; lines?: any[] }>,
  index: number,
) =>
  buildCorrection({
    original: two(),
    refunds,
    index,
    refundId: 'r1',
    number: 'R-2026-00002',
    now,
  });

const colaLine = {
  lineIndex: 1,
  quantity: 1,
  grossCents: 350,
  taxRateBasisPoints: 1900,
};

describe('invoice rules', () => {
  it('numbers are R, the year and five digits', () => {
    expect(formatInvoiceNumber('2026', 42)).toBe('R-2026-00042');
    expect(formatInvoiceNumber('2026', 123456)).toBe('R-2026-123456');
  });

  it('the counter starts again each year', () => {
    expect(nextSequence({ year: '2026', nextNumber: 12 }, '2027')).toBe(1);
    expect(nextSequence({ year: '2026', nextNumber: 12 }, '2026')).toBe(12);
    expect(nextSequence(null, '2026')).toBe(1);
    expect(yearKeyOf(new Date('2026-12-31T23:30:00Z'), 'Europe/Berlin')).toBe(
      '2027',
    );
  });

  it('builds an invoice snapshot from the order', () => {
    const inv = one();
    expect(inv).toEqual(
      expect.objectContaining({
        id: 'o1',
        shopId: 'shop-1',
        kind: 'invoice',
        documentType: 'invoice',
        number: NUMBER,
        templateVersion: 'receipt-2026-10',
        issuedAt: '2026-10-05T10:05:00.000Z',
        supplyDate: '2026-10-05T10:05:00.000Z',
        timezone: 'Europe/Berlin',
        buyer: { name: 'Anna', address: null },
        totalCents: 1050,
        currency: 'EUR',
        orderRef: 'AB3-K7P',
        language: 'de',
        corrects: null,
        refundId: null,
        payment: { method: 'card', stripePaymentIntentId: 'pi_1' },
        taxBreakdown: [
          { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
        ],
        lines: [
          {
            name: 'Carbonara',
            quantity: 1,
            unitPriceCents: 1050,
            lineTotalCents: 1050,
            taxRateBasisPoints: 700,
            taxCents: 69,
          },
        ],
      }),
    );
    expect(inv.seller).toEqual(
      expect.objectContaining({
        legalName: 'Ma Pasta GmbH',
        vatId: 'DE123456789',
        taxNumber: '',
      }),
    );
    expect(inv).not.toHaveProperty('customerEmail');
    expect(JSON.stringify(inv)).not.toContain('a@example.com');
    const t = two();
    expect(t.lines.map((l) => l.name)).toEqual(['Carbonara', 'Cola']);
    expect(t.lines.length).toBe(TWO_LINE_ORDER.items.length);
  });

  it("prints the diner's address when given", () => {
    const inv = buildInvoice({
      order: { ...ACCEPTED_CARD_ORDER, customerAddress: ADDRESS },
      shop: CARD_SHOP,
      number: NUMBER,
      now,
    });
    expect(invoiceTextLines(inv).buyer).toEqual([
      'Kunde: Anna',
      'Musterstraße 1',
      '60311 Frankfurt am Main',
      'Deutschland',
    ]);
  });

  it('German invoice text', () => {
    const t = text(one());
    for (const s of [
      'Rechnung',
      'Rechnungsnummer: R-2026-00001',
      'Rechnungsdatum: 05.10.2026',
      'Leistungsdatum: 05.10.2026',
      '1 × Carbonara',
      'Nettobetrag 7 %: 9,81 €',
      'USt. 7 %: 0,69 €',
      'Gesamtbetrag (brutto): 10,50 €',
      'USt-IdNr.: DE123456789',
    ]) {
      expect(t).toContain(s);
    }
  });

  it('English invoice text', () => {
    const inv = { ...one(), language: 'en' as const };
    const t = text(inv);
    for (const s of [
      'Invoice number: R-2026-00001',
      'Invoice date: 05/10/2026',
      'Net amount 7%: €9.81',
      'VAT 7%: €0.69',
      'Total (gross): €10.50',
    ]) {
      expect(t).toContain(s);
    }
  });

  it('needs a tax number or VAT ID', () => {
    const legal = CARD_SHOP.legal!;
    const noIds: Shop = {
      ...CARD_SHOP,
      legal: { ...legal, impressum: { ...legal.impressum!, vatId: '' } },
    };
    expect(() =>
      buildInvoice({
        order: ACCEPTED_CARD_ORDER,
        shop: noIds,
        number: NUMBER,
        now,
      }),
    ).toThrow(INVOICE_TAX_ID_MISSING);
    const withTaxNumber: Shop = {
      ...noIds,
      legal: { ...noIds.legal!, taxNumber: '045/123/45678' },
    };
    const inv = buildInvoice({
      order: ACCEPTED_CARD_ORDER,
      shop: withTaxNumber,
      number: NUMBER,
      now,
    });
    expect(inv.seller.taxNumber).toBe('045/123/45678');
    expect(text(inv)).toContain('Steuernummer: 045/123/45678');
  });

  it('a full refund makes a Stornorechnung mirroring every line', () => {
    const c = correct([{ amountCents: 1400 }], 0);
    expect(c).toEqual(
      expect.objectContaining({
        documentType: 'cancellation',
        id: 'o1-c1',
        totalCents: -1400,
        corrects: { number: NUMBER, issuedAt: '2026-10-05T10:05:00.000Z' },
        taxBreakdown: [
          { rateBasisPoints: 700, grossCents: -1050, taxCents: -69 },
          { rateBasisPoints: 1900, grossCents: -350, taxCents: -56 },
        ],
      }),
    );
    expect(c.lines).toEqual([
      expect.objectContaining({
        name: 'Carbonara',
        lineTotalCents: -1050,
        taxCents: -69,
      }),
      expect.objectContaining({
        name: 'Cola',
        lineTotalCents: -350,
        taxCents: -56,
      }),
    ]);
    const t = text(c);
    expect(t).toContain('Stornorechnung');
    expect(t).toContain(
      'Bezieht sich auf Rechnung R-2026-00001 vom 05.10.2026',
    );
  });

  it('ticking every item on the first refund is a Stornorechnung too', () => {
    const c = correct(
      [
        {
          amountCents: 1400,
          lines: [
            {
              lineIndex: 0,
              quantity: 1,
              grossCents: 1050,
              taxRateBasisPoints: 700,
            },
            colaLine,
          ],
        },
      ],
      0,
    );
    expect(c.documentType).toBe('cancellation');
    expect(c.lines).toEqual(
      two().lines.map((l) => ({
        ...l,
        unitPriceCents: -l.unitPriceCents,
        lineTotalCents: -l.lineTotalCents,
        taxCents: -l.taxCents,
      })),
    );
    expect(c.lines.map((l) => l.taxCents)).toEqual([-69, -56]);
  });

  it('an item refund lists the item at its own rate', () => {
    const c = correct([{ amountCents: 350, lines: [colaLine] }], 0);
    expect(c.documentType).toBe('correction');
    expect(c.lines).toEqual([
      {
        name: 'Cola',
        quantity: 1,
        unitPriceCents: -350,
        lineTotalCents: -350,
        taxRateBasisPoints: 1900,
        taxCents: -56,
      },
    ]);
    expect(c.taxBreakdown).toEqual([
      { rateBasisPoints: 1900, grossCents: -350, taxCents: -56 },
    ]);
    expect(c.totalCents).toBe(-350);
    const t = text(c);
    expect(t).toContain('1 × Cola');
    expect(t).toContain('USt. 19 %: -0,56 €');
    expect(t).toContain('Rechnungskorrektur');
    expect(t).not.toContain('USt. 7 %');
  });

  it('partial refund splits across VAT rates in proportion', () => {
    const c = correct([{ amountCents: 300 }], 0);
    expect(c.documentType).toBe('correction');
    expect(c.lines).toEqual([
      expect.objectContaining({
        name: 'Teilerstattung (7 %)',
        lineTotalCents: -225,
        taxRateBasisPoints: 700,
        taxCents: -15,
      }),
      expect.objectContaining({
        name: 'Teilerstattung (19 %)',
        lineTotalCents: -75,
        taxRateBasisPoints: 1900,
        taxCents: -12,
      }),
    ]);
    expect(c.totalCents).toBe(-300);
    expect(text(c)).toContain('Korrekturbetrag (brutto): -3,00 €');
    const second = correct([{ amountCents: 300 }, { amountCents: 1100 }], 1);
    expect(second.documentType).toBe('correction');
    expect(
      second.lines.map((l) => [l.lineTotalCents, l.taxRateBasisPoints]),
    ).toEqual([
      [-825, 700],
      [-275, 1900],
    ]);
  });

  it('a free amount after an item refund only uses what is left', () => {
    const c = correct(
      [{ amountCents: 350, lines: [colaLine] }, { amountCents: 500 }],
      1,
    );
    expect(c.lines).toEqual([
      expect.objectContaining({
        name: 'Teilerstattung (7 %)',
        lineTotalCents: -500,
        taxCents: -extractVatCents(500, 700),
      }),
    ]);
    expect(c.lines[0].taxCents).toBe(-33);
  });

  it('replaces characters the PDF font cannot show', () => {
    expect(toWinAnsi('Café € 🍕 Ω')).toBe('Café € ? ?');
  });

  it('file names say what the document is', () => {
    const f = (documentType: any, language: any) =>
      invoiceFileName({ number: NUMBER, documentType, language });
    expect(f('invoice', 'de')).toBe('Rechnung-R-2026-00001.pdf');
    expect(f('cancellation', 'de')).toBe('Stornorechnung-R-2026-00001.pdf');
    expect(f('correction', 'de')).toBe('Rechnungskorrektur-R-2026-00001.pdf');
    expect(f('invoice', 'en')).toBe('Invoice-R-2026-00001.pdf');
    expect(f('cancellation', 'en')).toBe(
      'Cancellation-invoice-R-2026-00001.pdf',
    );
    expect(f('correction', 'en')).toBe('Correction-invoice-R-2026-00001.pdf');
  });

  it('invoice lines carry the offer price that was charged', () => {
    const priced = priceBasket({
      items: [{ productId: 'p1', quantity: 2 }],
      products: new Map([['p1', { ...P_PASTA, schedule: { startDate: '2026-10-01', offerPrice: 800 } }]]),
      categories: CATEGORIES,
      refs: DE_REFERENCE_LISTS,
      shop: { timezone: 'Europe/Berlin', menuLanguages: ['de'], countryCode: 'DE' },
      mode: 'collection',
      now,
      language: 'de',
    });
    const order: Order = {
      ...ACCEPTED_CARD_ORDER,
      items: priced.items,
      subtotalCents: priced.subtotalCents,
      taxBreakdown: priced.taxBreakdown,
    };
    const inv = buildInvoice({ order, shop: CARD_SHOP, number: NUMBER, now });
    expect(inv.lines[0]).toMatchObject({ quantity: 2, unitPriceCents: 800, lineTotalCents: 1600, taxCents: 105 });
    expect(inv.totalCents).toBe(1600);
    expect(inv.taxBreakdown).toEqual([{ rateBasisPoints: 700, grossCents: 1600, taxCents: 105 }]);
  });

describe('delivery invoices', () => {
  it('a delivery invoice lists the fee after the dishes and adds it to the total', () => {
    const inv = buildInvoice({ order: ACCEPTED_DELIVERY_ORDER, shop: CARD_SHOP, number: NUMBER, now });
    expect(inv.lines[1]).toEqual({
      name: 'Liefergebühr',
      quantity: 1,
      unitPriceCents: 250,
      lineTotalCents: 250,
      taxRateBasisPoints: 700,
      taxCents: 16,
    });
    expect(inv.totalCents).toBe(1300);
    expect(inv.taxBreakdown).toEqual([{ rateBasisPoints: 700, grossCents: 1300, taxCents: 85 }]);
    expect(inv.buyer.address).toBeNull();
    const t = text(inv);
    expect(t).toContain('1 × Liefergebühr');
    expect(t).toContain('Gesamtbetrag (brutto): 13,00 €');
    expect(t).not.toContain('Teststraße');
    const en = buildInvoice({ order: { ...ACCEPTED_DELIVERY_ORDER, language: 'en' }, shop: CARD_SHOP, number: NUMBER, now });
    expect(en.lines[1].name).toBe('Delivery fee');
  });

  it('a delivery Stornorechnung negates the fee too', () => {
    const c = buildCorrection({
      original: buildInvoice({ order: ACCEPTED_DELIVERY_ORDER, shop: CARD_SHOP, number: NUMBER, now }),
      refunds: [{ amountCents: 1300 }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
    expect(c.documentType).toBe('cancellation');
    expect(c.lines[1].lineTotalCents).toBe(-250);
    expect(c.totalCents).toBe(-1300);
  });
});
});

describe('discounted invoices', () => {
  const inv = () => buildInvoice({ order: DISCOUNTED_ORDER, shop: CARD_SHOP, number: NUMBER, now });
  const sumAt = (lines: ReturnType<typeof inv>['lines'], rate: number) =>
    lines
      .filter((l) => l.taxRateBasisPoints === rate)
      .reduce((s, l) => ({ gross: s.gross + l.lineTotalCents, tax: s.tax + l.taxCents }), { gross: 0, tax: 0 });

  it("the discount is its own line per VAT rate and lowers each rate's totals", () => {
    const i = inv();
    expect(i.lines.slice(2)).toEqual([
      { name: 'Rabatt WELCOME10', quantity: 1, unitPriceCents: -105, lineTotalCents: -105, taxRateBasisPoints: 700, taxCents: -7 },
      { name: 'Rabatt WELCOME10', quantity: 1, unitPriceCents: -35, lineTotalCents: -35, taxRateBasisPoints: 1900, taxCents: -6 },
    ]);
    expect(i.totalCents).toBe(1260);
    expect(i.taxBreakdown).toEqual(DISCOUNTED_ORDER.taxBreakdown);
    expect(sumAt(i.lines, 700)).toEqual({ gross: 945, tax: 62 });
    expect(sumAt(i.lines, 1900)).toEqual({ gross: 315, tax: 50 });
    const t = text(i);
    expect(t).toContain('1 × Rabatt WELCOME10');
    expect(t).toContain('Nettobetrag 7 %: 8,83 €');
    expect(t).toContain('USt. 7 %: 0,62 €');
    expect(t).toContain('Nettobetrag 19 %: 2,65 €');
    expect(t).toContain('USt. 19 %: 0,50 €');
    expect(t).toContain('Gesamtbetrag (brutto): 12,60 €');
    const en = buildInvoice({ order: { ...DISCOUNTED_ORDER, language: 'en' }, shop: CARD_SHOP, number: NUMBER, now });
    expect(en.lines[2].name).toBe('Discount WELCOME10');
    const voucher = buildInvoice({
      order: { ...DISCOUNTED_ORDER, discount: { ...DISCOUNTED_ORDER.discount!, kind: 'voucher', code: 'L-ABCD2345' } },
      shop: CARD_SHOP,
      number: NUMBER,
      now,
    });
    expect(voucher.lines[2].name).toBe('Gutschein L-ABCD2345');
  });

  it('discount lines come before the delivery fee', () => {
    const order = { ...DISCOUNTED_ORDER, fulfilmentMode: 'delivery' as const, deliveryAddress: DELIVERY_ADDRESS, charges: [FEE_CHARGE], totalCents: 1510 };
    expect(buildInvoice({ order, shop: CARD_SHOP, number: NUMBER, now }).lines.map((l) => l.name)).toEqual([
      'Carbonara',
      'Cola',
      'Rabatt WELCOME10',
      'Rabatt WELCOME10',
      'Liefergebühr',
    ]);
  });

  it('an item refund on a discounted order shows the share of the discount', () => {
    const c = buildCorrection({
      original: inv(),
      refunds: [{ amountCents: 315, lines: [{ lineIndex: 1, quantity: 1, grossCents: 315, taxRateBasisPoints: 1900 }] }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
    expect(c.lines).toEqual([
      { name: 'Cola', quantity: 1, unitPriceCents: -350, lineTotalCents: -350, taxRateBasisPoints: 1900, taxCents: -56 },
      { name: 'Anteiliger Rabatt', quantity: 1, unitPriceCents: 35, lineTotalCents: 35, taxRateBasisPoints: 1900, taxCents: 6 },
    ]);
    expect(c.taxBreakdown).toEqual([{ rateBasisPoints: 1900, grossCents: -315, taxCents: -50 }]);
    expect(c.totalCents).toBe(-315);
    expect(c.documentType).toBe('correction');
  });

  it('a full refund of a discounted order negates the discount lines too', () => {
    const c = buildCorrection({
      original: inv(),
      refunds: [{ amountCents: 1260 }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
    expect(c.documentType).toBe('cancellation');
    expect(c.lines[2].lineTotalCents).toBe(105);
    expect(c.totalCents).toBe(-1260);
  });
});
