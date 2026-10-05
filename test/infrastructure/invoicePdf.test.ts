import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildCorrection, buildInvoice } from '../../src/domain/invoice/invoice';
import { renderInvoicePdf } from '../../src/infrastructure/pdf/invoicePdf';
import { ACCEPTED_CARD_ORDER, CARD_SHOP } from '../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const invoice = () => buildInvoice({ order: ACCEPTED_CARD_ORDER, shop: CARD_SHOP, number: 'R-2026-00001', now });

describe('renderInvoicePdf', () => {
  it('renders a one-page PDF titled with the number', async () => {
    const bytes = await renderInvoicePdf(invoice());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Rechnung R-2026-00001');
    expect(pdf.getPageCount()).toBe(1);
  });

  it('renders a name the font cannot show', async () => {
    const inv = { ...invoice(), buyer: { name: 'Anna 🍕', address: null } };
    const bytes = await renderInvoicePdf(inv);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('renders a correction titled Rechnungskorrektur', async () => {
    const correction = buildCorrection({
      original: invoice(),
      refunds: [{ amountCents: 300 }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
    const pdf = await PDFDocument.load(await renderInvoicePdf(correction));
    expect(pdf.getTitle()).toBe('Rechnungskorrektur R-2026-00002');
  });
});
