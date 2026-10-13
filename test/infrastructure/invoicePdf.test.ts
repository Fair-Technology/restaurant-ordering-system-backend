import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { buildCorrection, buildInvoice } from '../../src/domain/invoice/invoice';
import { renderInvoicePdf } from '../../src/infrastructure/pdf/invoicePdf';
import { ACCEPTED_CARD_ORDER, CARD_SHOP } from '../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const invoice = () => buildInvoice({ order: ACCEPTED_CARD_ORDER, shop: CARD_SHOP, number: 'R-2026-00001', now });

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
  return text as string;
}
async function lineYs(bytes: Uint8Array): Promise<Array<{ str: string; y: number }>> {
  const page = await (await getDocumentProxy(new Uint8Array(bytes))).getPage(1);
  return (await page.getTextContent()).items.flatMap((i: any) => ('str' in i ? [{ str: i.str, y: i.transform[5] }] : []));
}
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter(
      (o): o is PDFDict =>
        o instanceof PDFDict &&
        o.get(PDFName.of('Type')) === PDFName.of('Font') &&
        o.get(PDFName.of('Subtype')) === PDFName.of('Type0'),
    )
    .map((o) => (o.get(PDFName.of('BaseFont')) as PDFName).decodeText())
    .sort();
}
const withSeller = (legalName: string) => {
  const i = invoice();
  return { ...i, seller: { ...i.seller, legalName } };
};

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

  it('prints the seller name Şahin Döner GmbH with its own letters', async () => {
    const text = await pdfText(await renderInvoicePdf(withSeller('Şahin Döner GmbH')));
    expect(text).toContain('Şahin Döner GmbH');
    expect(text).not.toContain('?ahin');
  });

  it('prints Polish ł in the buyer name', async () => {
    const inv = { ...invoice(), buyer: { name: 'Paweł Łukasz', address: null } };
    expect(await pdfText(await renderInvoicePdf(inv))).toContain('Kunde: Paweł Łukasz');
  });

  it('prints 寿司 in a dish name with the CJK font', async () => {
    const i = invoice();
    const inv = { ...i, lines: [{ ...i.lines[0], name: '寿司 Sushi-Platte' }] };
    const bytes = await renderInvoicePdf(inv);
    const text = await pdfText(bytes);
    expect(text).toContain('寿司');
    expect(text).toContain('Sushi-Platte');
    expect(await fontNames(bytes)).toEqual(['NotoSans-Bold', 'NotoSans-Regular', 'NotoSansCJKsc-Regular']);
    expect(bytes.length).toBeLessThan(120_000);
  });

  it('a Latin-only invoice embeds only the two Latin fonts', async () => {
    const bytes = await renderInvoicePdf(invoice());
    expect(await fontNames(bytes)).toEqual(['NotoSans-Bold', 'NotoSans-Regular']);
    expect(bytes.length).toBeLessThan(80_000);
  });

  it('prints ? for a character no font has', async () => {
    const inv = { ...invoice(), buyer: { name: 'Anna 🍕', address: null } };
    expect(await pdfText(await renderInvoicePdf(inv))).toContain('Kunde: Anna ?');
  });

  it("a correction keeps the seller's Ş", async () => {
    const correction = buildCorrection({
      original: withSeller('Şahin Döner GmbH'),
      refunds: [{ amountCents: 300 }],
      index: 0,
      refundId: 'r1',
      number: 'R-2026-00002',
      now,
    });
    const bytes = await renderInvoicePdf(correction);
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('Rechnungskorrektur R-2026-00002');
    expect(await pdfText(bytes)).toContain('Şahin Döner GmbH');
  });

  it('wraps a long dish name above the next item', async () => {
    const i = invoice();
    const inv = {
      ...i,
      lines: [
        { ...i.lines[0], name: 'Pizza ' + 'Extragroß '.repeat(8) + 'Ende' },
        { ...i.lines[0], name: 'Cola' },
      ],
    };
    const items = await lineYs(await renderInvoicePdf(inv));
    const first = items.find((x) => x.str.includes('Pizza'))!;
    const last = items.find((x) => x.str.includes('Ende'))!;
    const cola = items.find((x) => x.str.includes('Cola'))!;
    expect(last.y).toBeLessThan(first.y);
    expect(cola.y).toBeLessThan(last.y);
    expect(items.some((x) => x.str.includes('Pizza') && x.str.includes('Ende'))).toBe(false);
  });
});
