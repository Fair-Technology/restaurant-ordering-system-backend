/**
 * Invoice template version snapshot.
 *
 * Every stored invoice records INVOICE_TEMPLATE_VERSION, but its PDF is re-rendered from the current
 * code (invoicePdf.ts -> invoiceTextLines()). A silent wording change would therefore alter what old
 * invoices look like. This test renders a fixed set of representative documents and compares the
 * text with the snapshot recorded for the current template version in invoiceTemplate.golden.json.
 *
 * If this test fails because the rendered text changed, you MUST bump `INVOICE_TEMPLATE_VERSION` in
 * src/domain/invoice/invoice.ts to a new value and add a new entry for that version to
 * invoiceTemplate.golden.json — never edit an existing version's entry in place.
 */
import { describe, expect, it } from 'vitest';
import {
  INVOICE_TEMPLATE_VERSION_V1 as INVOICE_TEMPLATE_VERSION,
  buildCorrection as buildCorrectionRaw,
  buildInvoice as buildInvoiceRaw,
  invoiceTextLines,
} from '../../src/domain/invoice/invoice';
import type { InvoiceDoc } from '../../src/domain/invoice/invoice';
import golden from './invoiceTemplate.golden.json';
import {
  ACCEPTED_CARD_ORDER,
  ACCEPTED_DELIVERY_ORDER,
  ACCEPTED_TWO_LINE_ORDER,
  ADDRESS,
  CARD_SHOP,
  COMBO_ORDER,
  DISCOUNTED_ORDER,
} from '../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const NUMBER = 'R-2026-00001';

// This file is the V1 wording snapshot: every case is pinned to the V1 template version regardless of the current default.
const buildInvoice = (...a: Parameters<typeof buildInvoiceRaw>): InvoiceDoc => ({ ...buildInvoiceRaw(...a), templateVersion: INVOICE_TEMPLATE_VERSION });
const buildCorrection = (...a: Parameters<typeof buildCorrectionRaw>): InvoiceDoc => ({ ...buildCorrectionRaw(...a), templateVersion: INVOICE_TEMPLATE_VERSION });

const normalize = (line: string): string => line.replace(/[   ]/g, ' ');

function renderText(inv: InvoiceDoc): string {
  const t = invoiceTextLines(inv);
  return [
    t.title,
    ...t.seller,
    ...t.buyer,
    ...t.meta,
    ...t.items.map(
      (item) => `${item.text} | ${item.unit} | ${item.total} | ${item.rate}`,
    ),
    ...t.totals,
    ...t.footer,
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

const colaLine = {
  lineIndex: 1,
  quantity: 1,
  grossCents: 350,
  taxRateBasisPoints: 1900,
};

const cases: Record<string, InvoiceDoc> = {
  'invoice-de': buildInvoice({
    order: ACCEPTED_CARD_ORDER,
    shop: CARD_SHOP,
    number: NUMBER,
    now,
  }),
  // The order carries no page language, so the shop's original language (en) applies — keeps the V1 golden byte-identical.
  'invoice-en': buildInvoice({
    order: (({ language: _l, ...o }) => o)(ACCEPTED_CARD_ORDER),
    shop: { ...CARD_SHOP, menuLanguages: ['en'] },
    number: NUMBER,
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
