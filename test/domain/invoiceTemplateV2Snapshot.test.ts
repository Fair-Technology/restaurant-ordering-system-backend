/**
 * Invoice template V2 ("Restaurant Ordering") wording snapshot, the counterpart of invoiceTemplateSnapshot.test.ts.
 *
 * Renders the text model behind the V2 PDF (invoiceV2Table) for the same fixed cases and compares it with the
 * snapshot recorded for the current INVOICE_TEMPLATE_VERSION in invoiceTemplateV2.golden.json.
 *
 * If this test fails because the text changed, you MUST bump `INVOICE_TEMPLATE_VERSION` in
 * src/domain/invoice/invoice.ts to a new value and add a new entry for that version to the golden file
 * — never edit an existing version's entry in place.
 */
import { describe, expect, it } from 'vitest';
import {
  INVOICE_TEMPLATE_VERSION,
  buildCorrection,
  buildInvoice,
  invoiceV2Table,
} from '../../src/domain/invoice/invoice';
import type { InvoiceDoc } from '../../src/domain/invoice/invoice';
import golden from './invoiceTemplateV2.golden.json';
import {
  ACCEPTED_CARD_ORDER,
  ACCEPTED_DELIVERY_ORDER,
  ACCEPTED_TWO_LINE_ORDER,
  ADDRESS,
  CARD_SHOP,
  COMBO_ORDER,
  DISCOUNTED_ORDER,
} from '../fixtures/orders';
import { COMPLETE_INVOICE_EXTRAS, COMPLETE_LEGAL } from '../fixtures/legal';

const now = new Date('2026-10-05T10:05:00Z');
const NUMBER = 'R-2026-00001';

const normalize = (line: string): string =>
  line.replace(/[\u00a0\u202f]/g, ' ');

function renderText(inv: InvoiceDoc): string {
  const t = invoiceV2Table(inv);
  return [
    inv.templateVersion,
    t.title,
    t.priceNote,
    t.sellerName,
    t.sellerAddressLine,
    ...t.buyer,
    ...t.meta.map((m) => `${m.label}: ${m.value}`),
    ...t.notes,
    Object.values(t.columns).join(' | '),
    ...t.rows.map(
      (r) =>
        `${r.pos} | ${r.name}${r.modifiers ? ` · ${r.modifiers}` : ''} | ${r.quantity} | ${r.unit} | ${r.rate} | ${r.total}`,
    ),
    t.settlement.badge,
    t.settlement.note,
    t.settlement.net,
    ...t.settlement.taxLines,
    t.settlement.total,
    t.closing,
    ...t.footer.flatMap((c) => [c.heading, ...c.lines]),
  ]
    .map(normalize)
    .join('\n');
}

const twoLine = (): InvoiceDoc =>
  buildInvoice({
    order: ACCEPTED_TWO_LINE_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  });

const withoutLanguage = <T extends { language?: unknown }>(o: T): T => {
  const copy = { ...o };
  delete copy.language;
  return copy;
};

const enDiner = (): InvoiceDoc =>
  buildInvoice({
    order: { ...ACCEPTED_TWO_LINE_ORDER, language: 'en' },
    shop: { ...CARD_SHOP, menuLanguages: ['de'] },
    number: NUMBER,
    now,
  });

const colaLine = {
  lineIndex: 1,
  quantity: 1,
  grossCents: 350,
  taxRateBasisPoints: 1900,
};

const extrasShop = {
  ...CARD_SHOP,
  legal: { ...COMPLETE_LEGAL, invoiceLegalExtras: COMPLETE_INVOICE_EXTRAS },
};

const cases: Record<string, InvoiceDoc> = {
  'invoice-with-legal-extras': buildInvoice({
    order: ACCEPTED_TWO_LINE_ORDER,
    shop: extrasShop,
    number: NUMBER,
    now,
  }),
  'invoice-de': buildInvoice({
    order: ACCEPTED_CARD_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  // Fallback path: an older order with no page language uses the shop's original language.
  'invoice-en-fallback': buildInvoice({
    order: withoutLanguage(ACCEPTED_CARD_ORDER),
    shop: { ...CARD_SHOP, menuLanguages: ['en'] },
    number: NUMBER,
    now,
  }),
  'invoice-de-diner': buildInvoice({
    order: { ...ACCEPTED_CARD_ORDER, language: 'de' },
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  // The diner's page language overrides the (German) shop's menu language.
  'invoice-en-diner': enDiner(),
  'correction-en-diner': buildCorrection({
    original: enDiner(),
    refunds: [{ amountCents: 350, lines: [colaLine] }],
    index: 0,
    refundId: 'r1',
    number: 'R-2026-00002',
    now,
  }),
  'cancellation-en-diner': buildCorrection({
    original: enDiner(),
    refunds: [{ amountCents: enDiner().totalCents }],
    index: 0,
    refundId: 'r1',
    number: 'R-2026-00002',
    now,
  }),
  'invoice-with-address': buildInvoice({
    order: { ...ACCEPTED_CARD_ORDER, customerAddress: ADDRESS },
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  'invoice-delivery-fee': buildInvoice({
    order: ACCEPTED_DELIVERY_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  'invoice-discount': buildInvoice({
    order: DISCOUNTED_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  'invoice-combo': buildInvoice({
    order: COMBO_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  cancellation: (() => {
    const original = twoLine();
    return buildCorrection({
      original,
      refunds: [{ amountCents: original.totalCents }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
  })(),
  correction: buildCorrection({
    original: twoLine(),
    refunds: [{ amountCents: 350, lines: [colaLine] }],
    index: 0,
    refundId: 'r1',
    number: 'R-2026-00002',
    now,
  }),
  reversal: buildCorrection({
    original: twoLine(),
    refunds: [
      { amountCents: 350, lines: [colaLine] },
      { amountCents: -350, reversesIndex: 0 },
    ],
    index: 1,
    refundId: 'v1',
    number: 'R-2026-00003',
    now,
    reverses: {
      number: 'R-2026-00002',
      issuedAt: now.toISOString(),
      documentType: 'correction',
    },
  }),
};

const canonical = () =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(cases).map(([k, v]) => [k, renderText(v)]),
    ),
    null,
    2,
  );

describe('invoice template version snapshot', () => {
  it('has a recorded snapshot for the current template version', () => {
    expect(golden).toHaveProperty(INVOICE_TEMPLATE_VERSION);
  });

  it('the rendered invoice text still matches the snapshot for the current template version', () => {
    expect((golden as Record<string, string>)[INVOICE_TEMPLATE_VERSION]).toBe(
      canonical(),
    );
  });
});
