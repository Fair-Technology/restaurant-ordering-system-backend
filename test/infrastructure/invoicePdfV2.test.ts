import { readFileSync } from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import {
  INVOICE_TEMPLATE_VERSION,
  INVOICE_TEMPLATE_VERSION_V1,
  INVOICE_TEMPLATE_VERSION_V2,
  buildCorrection,
  buildInvoice,
  invoiceV2Table,
} from '../../src/domain/invoice/invoice';
import type { InvoiceDoc } from '../../src/domain/invoice/invoice';
import {
  renderInvoicePdf,
  renderInvoicePdfV2,
} from '../../src/infrastructure/pdf/invoicePdf';
import { COMPLETE_INVOICE_EXTRAS, COMPLETE_LEGAL } from '../fixtures/legal';
import {
  ACCEPTED_CARD_ORDER,
  ACCEPTED_DELIVERY_ORDER,
  ACCEPTED_TWO_LINE_ORDER,
  ADDRESS,
  CARD_SHOP,
  COMBO_ORDER,
} from '../fixtures/orders';

const now = new Date('2026-11-20T10:05:00Z');
const NUMBER = 'R-2026-00001';
const nb = (s: string): string =>
  s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ');

const make = (order = ACCEPTED_CARD_ORDER, shop = CARD_SHOP): InvoiceDoc =>
  buildInvoice({ order, shop, number: NUMBER, now });
const shopWithExtras = (extras: Partial<typeof COMPLETE_INVOICE_EXTRAS>) => ({
  ...CARD_SHOP,
  legal: {
    ...COMPLETE_LEGAL,
    invoiceLegalExtras: { ...COMPLETE_INVOICE_EXTRAS, ...extras },
  },
});

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const { text } = await extractText(
    await getDocumentProxy(new Uint8Array(bytes)),
    { mergePages: false },
  );
  return (text as string[]).map(nb);
}
async function allText(bytes: Uint8Array): Promise<string> {
  return (await pageTexts(bytes)).join('\n');
}
async function lineYs(
  bytes: Uint8Array,
  pageNo = 1,
): Promise<Array<{ str: string; y: number }>> {
  const page = await (
    await getDocumentProxy(new Uint8Array(bytes))
  ).getPage(pageNo);
  return (await page.getTextContent()).items.flatMap((i: any) =>
    'str' in i ? [{ str: i.str, y: i.transform[5] }] : [],
  );
}
const manyLines = (n: number): InvoiceDoc => {
  const inv = make(ACCEPTED_TWO_LINE_ORDER);
  return {
    ...inv,
    lines: Array.from({ length: n }, (_, i) => ({
      ...inv.lines[0],
      name: `Gericht ${i + 1}`,
      productName: `Gericht ${i + 1}`,
    })),
  };
};

describe('template version', () => {
  it('newly built invoices and corrections get the V2 version', () => {
    expect(INVOICE_TEMPLATE_VERSION).toBe(INVOICE_TEMPLATE_VERSION_V2);
    expect(make().templateVersion).toBe('invoice-2026-11');
    const c = buildCorrection({
      original: make(),
      refunds: [{ amountCents: 300 }],
      index: 0,
      refundId: 'r',
      number: 'R-2026-00002',
      now,
    });
    expect(c.templateVersion).toBe(INVOICE_TEMPLATE_VERSION_V2);
  });
  it('renderInvoicePdf dispatches on the stored version', async () => {
    const v1 = await renderInvoicePdf({
      ...make(),
      templateVersion: INVOICE_TEMPLATE_VERSION_V1,
    });
    const v2 = await renderInvoicePdf(make());
    expect(await allText(v1)).toContain('Kunde: Anna');
    expect(await allText(v2)).not.toContain('Kunde: Anna');
    expect(await allText(v2)).toContain('Vielen Dank für Ihre Bestellung.');
  });
  it('only the wordmark uses the brand colour and only the badge the positive colour', () => {
    const src = readFileSync(
      path.join(__dirname, '../../src/infrastructure/pdf/invoicePdf.ts'),
      'utf8',
    );
    expect(src.match(/TOKENS_V2\.brand\b/g)).toHaveLength(1);
    expect(src.match(/TOKENS_V2\.positive\b/g)).toHaveLength(1);
  });
});

describe('renderInvoicePdfV2', () => {
  it('renders a one-page PDF titled with the number and the new meta grid', async () => {
    const bytes = await renderInvoicePdfV2(make());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Rechnung R-2026-00001');
    expect(pdf.getPageCount()).toBe(1);
    const text = await allText(bytes);
    for (const s of [
      'Rechnungsnummer',
      'R-2026-00001',
      'Rechnungsdatum',
      'Leistungsdatum',
      '20.11.2026',
      'Pos.',
      'Beschreibung',
      'Menge',
      'Einzelpreis',
      'MwSt.',
      'Betrag',
      'Alle Einzelpreise inklusive Mehrwertsteuer.',
      'Gartenstraße 31, 60596 Frankfurt am Main',
      'Carbonara',
      '10,50 €',
    ]) {
      expect(text).toContain(s);
    }
    for (const s of ['Bestellnr', 'Bestellart', 'Zahlungsart'])
      expect(text).not.toContain(s);
  });

  it('prints the buyer address block', async () => {
    const text = await allText(
      await renderInvoicePdf(
        make({ ...ACCEPTED_CARD_ORDER, customerAddress: ADDRESS }),
      ),
    );
    expect(text).toContain(ADDRESS.street);
    expect(text).toContain(`${ADDRESS.postcode} ${ADDRESS.city}`);
  });

  it('merges identical item + modifier lines into one row with the summed quantity', () => {
    const item = ACCEPTED_CARD_ORDER.items[0];
    const inv = make({
      ...ACCEPTED_CARD_ORDER,
      items: [
        item,
        { ...item },
        { ...item, selectedVariantOptionName: 'Groß' },
        { ...item },
      ],
    });
    const rows = invoiceV2Table(inv).rows;
    expect(
      rows.map((r) => [r.pos, r.name, r.modifiers, r.quantity, nb(r.total)]),
    ).toEqual([
      [1, 'Carbonara', '', 3, '31,50 €'],
      [2, 'Carbonara', 'Groß', 1, '10,50 €'],
    ]);
  });

  it('prints a merged row with quantity N and the modifiers after a middle dot', async () => {
    const item = {
      ...ACCEPTED_CARD_ORDER.items[0],
      selectedAddonOptionNames: ['Käse', 'Speck'],
    };
    const text = await allText(
      await renderInvoicePdf(
        make({ ...ACCEPTED_CARD_ORDER, items: [item, { ...item }] }),
      ),
    );
    expect(text).toContain('Carbonara · Käse, Speck');
    expect(text).toMatch(/Carbonara · Käse, Speck\s+2\s+10,50 €/);
  });

  it('keeps the delivery fee on its own row even if identical to another row', () => {
    const fee = ACCEPTED_DELIVERY_ORDER.charges![0];
    const lookalike = {
      ...ACCEPTED_DELIVERY_ORDER.items[0],
      productName: 'Liefergebühr',
      unitPriceCents: fee.grossCents,
      lineTotalCents: fee.grossCents,
    };
    const inv = make({ ...ACCEPTED_DELIVERY_ORDER, items: [lookalike] });
    const rows = invoiceV2Table(inv).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.name, r.quantity, r.rate])).toEqual([
      ['Liefergebühr', 1, '7 %'],
      ['Liefergebühr', 1, '7 %'],
    ]);
  });

  it('never merges combo dishes, not even two identical combo instances', () => {
    const [a, b] = COMBO_ORDER.items;
    const one = invoiceV2Table(make(COMBO_ORDER)).rows;
    expect(one.map((r) => r.name)).toEqual([
      'Pasta-Menü: Carbonara',
      'Pasta-Menü: Cola',
    ]);
    const twice = make({
      ...COMBO_ORDER,
      items: [
        a,
        b,
        { ...a, combo: { ...a.combo!, line: 1 } },
        { ...b, combo: { ...b.combo!, line: 1 } },
      ],
    });
    const rows = invoiceV2Table(twice).rows;
    expect(rows.map((r) => [r.pos, r.quantity])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    // a combo dish does not merge with an identical plain item either
    const plain = make({
      ...COMBO_ORDER,
      items: [a, { ...a, combo: undefined }],
    });
    expect(invoiceV2Table(plain).rows).toHaveLength(2);
  });

  it('shows one "zzgl. X % MwSt." line per VAT rate present', async () => {
    const text = await allText(
      await renderInvoicePdf(make(ACCEPTED_TWO_LINE_ORDER)),
    );
    expect(text).toContain('zzgl. 7 % MwSt. auf 9,81 €: 0,69 €');
    expect(text).toContain('zzgl. 19 % MwSt. auf 5,88 €: 1,12 €');
    expect(text.match(/zzgl\./g)).toHaveLength(2);
    expect(text).toContain('Nettobetrag: 15,69 €');
    expect(text).toContain('Gesamtbetrag (brutto): 17,50 €');
  });

  it('single-rate invoices show one VAT line', async () => {
    const text = await allText(await renderInvoicePdf(make()));
    expect(text.match(/zzgl\./g)).toHaveLength(1);
  });

  it('puts the Stripe payment-intent id in the Bezahlt note', async () => {
    const text = await allText(await renderInvoicePdf(make()));
    expect(text).toContain('Bezahlt');
    expect(text).toContain(
      'Bezahlt am 20.11.2026 per Online-Zahlung (Stripe, Transaktion pi_1).',
    );
  });

  describe('footer', () => {
    it('includes Geschäftsführer, Amtsgericht + HRB and IBAN/BIC when present', async () => {
      const text = await allText(
        await renderInvoicePdf(make(ACCEPTED_CARD_ORDER, shopWithExtras({}))),
      );
      expect(text).toContain('Vielen Dank für Ihre Bestellung.');
      expect(text).toContain('Geschäftsführer');
      expect(text).toContain('Giulia Rossi');
      expect(text).toContain('Amtsgericht Frankfurt am Main HRB 123456');
      expect(text).toContain('IBAN: DE89370400440532013000');
      expect(text).toContain('BIC: COBADEFFXXX');
    });

    it('omits each column or line whose field is absent', () => {
      const t = invoiceV2Table(
        make(
          ACCEPTED_CARD_ORDER,
          shopWithExtras({ managingDirector: undefined, bic: undefined }),
        ),
      );
      expect(t.footer.map((c) => c.heading)).toEqual([
        'Handelsregister',
        'Bankverbindung',
        'Steuern',
      ]);
      expect(t.footer[1].lines).toEqual(['IBAN: DE89370400440532013000']);
      const noBank = invoiceV2Table(
        make(
          ACCEPTED_CARD_ORDER,
          shopWithExtras({ iban: undefined, bic: undefined }),
        ),
      );
      expect(noBank.footer.map((c) => c.heading)).toEqual([
        'Geschäftsführer',
        'Handelsregister',
        'Steuern',
      ]);
    });

    it('falls back to the Impressum register and skips the footer when nothing is left', async () => {
      const plain = make();
      expect(invoiceV2Table(plain).footer).toEqual([
        {
          heading: 'Handelsregister',
          lines: ['Amtsgericht Frankfurt am Main HRB 123456'],
        },
        { heading: 'Steuern', lines: ['USt-IdNr.: DE123456789'] },
      ]);
      const bare = {
        ...plain,
        seller: {
          ...plain.seller,
          registerCourt: '',
          registerNumber: '',
          vatId: '',
          taxNumber: '',
        },
      };
      expect(invoiceV2Table(bare).footer).toEqual([]);
      const text = await allText(await renderInvoicePdf(bare));
      expect(text).toContain('Vielen Dank für Ihre Bestellung.');
      expect(text).not.toContain('Handelsregister');
      expect(text).not.toContain('IBAN');
    });
  });

  describe('corrections', () => {
    const original = () => make(ACCEPTED_TWO_LINE_ORDER);

    it('renders a cancellation with negative amounts per rate and the original number', async () => {
      const o = original();
      const c = buildCorrection({
        original: o,
        refunds: [{ amountCents: o.totalCents }],
        index: 0,
        refundId: 'r1',
        number: 'R-2026-00002',
        now,
      });
      const bytes = await renderInvoicePdf(c);
      expect((await PDFDocument.load(bytes)).getTitle()).toBe(
        'Stornorechnung R-2026-00002',
      );
      const text = await allText(bytes);
      expect(text).toContain('Stornorechnung');
      expect(text).toContain('Bezieht sich auf');
      expect(text).toContain('Rechnung R-2026-00001 vom 20.11.2026');
      expect(text).toContain('zzgl. 7 % MwSt. auf -9,81 €: -0,69 €');
      expect(text).toContain('zzgl. 19 % MwSt. auf -5,88 €: -1,12 €');
      expect(text).toContain('Erstattet');
      expect(text).toContain(
        'Gesamtbetrag'.replace('Gesamtbetrag', 'Korrekturbetrag') +
          ' (brutto): -17,50 €',
      );
    });

    it('renders a partial correction with the Rechnungskorrektur title and the original reference', async () => {
      const c = buildCorrection({
        original: original(),
        refunds: [{ amountCents: 300 }],
        index: 0,
        refundId: 'r1',
        number: 'R-2026-00002',
        now,
      });
      const bytes = await renderInvoicePdf(c);
      expect((await PDFDocument.load(bytes)).getTitle()).toBe(
        'Rechnungskorrektur R-2026-00002',
      );
      const text = await allText(bytes);
      expect(text).toContain('Teilerstattung');
      expect(text).toContain('R-2026-00001');
    });

    it('item-refund corrections keep merge info and render as separate non-merged lines', () => {
      const c = buildCorrection({
        original: original(),
        refunds: [
          {
            amountCents: 350,
            lines: [
              {
                lineIndex: 1,
                quantity: 1,
                grossCents: 350,
                taxRateBasisPoints: 1900,
              },
            ],
          },
        ],
        index: 0,
        refundId: 'r1',
        number: 'R-2026-00002',
        now,
      });
      expect(c.lines[0].modifiers).toEqual([]);
      expect(invoiceV2Table(c).rows[0]).toMatchObject({
        name: 'Cola',
        quantity: 1,
      });
    });

    it('prints the reversal reference', async () => {
      const o = original();
      const colaLine = {
        lineIndex: 1,
        quantity: 1,
        grossCents: 350,
        taxRateBasisPoints: 1900,
      };
      const c = buildCorrection({
        original: o,
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
      });
      const text = await allText(await renderInvoicePdf(c));
      expect(text).toContain('Hebt auf');
      expect(text).toContain('Rechnungskorrektur R-2026-00002 vom 20.11.2026');
      expect(text).toContain(
        'Die Erstattung wurde von Stripe nicht ausgeführt.',
      );
    });
  });

  describe('pagination', () => {
    it('keeps an 18-line invoice with the full legal footer on one page', async () => {
      const base = make(ACCEPTED_TWO_LINE_ORDER, shopWithExtras({}));
      const inv = { ...base, lines: manyLines(18).lines };
      const bytes = await renderInvoicePdf(inv);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      const [page1] = await pageTexts(bytes);
      expect(page1).toContain('Gericht 18');
      expect(page1).toContain('Nettobetrag');
      expect(page1).toContain('Gesamtbetrag');
      expect(page1).toContain('Vielen Dank für Ihre Bestellung.');
      // nothing is drawn into the bottom margin
      const ys = await lineYs(bytes, 1);
      expect(Math.min(...ys.map((x) => x.y))).toBeGreaterThanOrEqual(40);
    });

    it('spans several pages, repeats the header, and draws settlement + footer on the last page only', async () => {
      const inv = {
        ...manyLines(45),
        seller: { ...make().seller, iban: 'DE89370400440532013000' },
      };
      const bytes = await renderInvoicePdf(inv);
      const pdf = await PDFDocument.load(bytes);
      const n = pdf.getPageCount();
      expect(n).toBeGreaterThanOrEqual(2);
      const texts = await pageTexts(bytes);
      expect(texts).toHaveLength(n);
      // table header on every page with rows
      for (const t of texts) {
        expect(t).toContain('Pos.');
        expect(t).toContain('Beschreibung');
        expect(t).toContain('Betrag');
      }
      // full header block only on page 1
      expect(texts[0]).toContain('Rechnungsnummer');
      expect(texts[0]).toContain('Alle Einzelpreise');
      // slim running line on continuation pages
      for (let i = 1; i < n; i++) {
        expect(texts[i]).toContain('Ma Pasta GmbH');
        expect(texts[i]).toContain('Rechnung R-2026-00001');
        expect(texts[i]).toContain(`Seite ${i + 1} von ${n}`);
        expect(texts[i]).not.toContain('Rechnungsnummer');
        expect(texts[i]).not.toContain('Alle Einzelpreise');
      }
      expect(texts[0]).not.toContain('Seite 1 von');
      // settlement / closing / footer only on the last page
      for (let i = 0; i < n - 1; i++) {
        for (const s of [
          'Bezahlt',
          'Vielen Dank',
          'Nettobetrag',
          'Gesamtbetrag',
          'IBAN',
        ])
          expect(texts[i]).not.toContain(s);
      }
      for (const s of [
        'Bezahlt am',
        'Vielen Dank für Ihre Bestellung.',
        'Nettobetrag',
        'Gesamtbetrag (brutto)',
        'IBAN: DE89370400440532013000',
      ]) {
        expect(texts[n - 1]).toContain(s);
      }
      // every row exactly once, in order
      const all = texts.join('\n');
      for (let i = 1; i <= 45; i++)
        expect(all.match(new RegExp(`Gericht ${i}(?!\\d)`, 'g'))).toHaveLength(
          1,
        );
    });

    it('page 2 header sits at the top of the page and rows stay below it', async () => {
      const bytes = await renderInvoicePdf(manyLines(45));
      const ys = await lineYs(bytes, 2);
      const header = ys.find((x) => x.str === 'Beschreibung')!;
      const firstRow = ys.find((x) => x.str.startsWith('Gericht'))!;
      expect(header.y).toBeGreaterThan(firstRow.y);
      expect(Math.min(...ys.map((x) => x.y))).toBeGreaterThanOrEqual(40);
    });

    it('drops the Einzelpreis column when the table needs three or more pages', async () => {
      const three = await pageTexts(await renderInvoicePdf(manyLines(80)));
      expect(three.length).toBeGreaterThanOrEqual(3);
      for (const t of three) expect(t).not.toMatch(/Einzelpreis(?!e)/);
      const one = await pageTexts(await renderInvoicePdf(make()));
      expect(one[0]).toContain('Einzelpreis');
      const two = await pageTexts(await renderInvoicePdf(manyLines(45)));
      expect(two).toHaveLength(2);
      expect(two[0]).toContain('Einzelpreis');
    });

    it('never splits a wrapped row across pages', async () => {
      const inv = make();
      const long = 'Extragroß '.repeat(30) + 'Ende';
      const lines = Array.from({ length: 30 }, (_, i) => ({
        ...inv.lines[0],
        name: `${long} ${i}`,
        productName: `${long} ${i}`,
      }));
      const bytes = await renderInvoicePdf({ ...inv, lines });
      const texts = await pageTexts(bytes);
      expect(texts.length).toBeGreaterThan(1);
      for (const t of texts) {
        // each page that starts a row also ends it: the Ende count matches the numbered tail count
        const rowsStarted = (t.match(/Extragroß/g) ?? []).length;
        expect(rowsStarted % 30).toBe(0);
        expect((t.match(/Ende/g) ?? []).length * 30).toBe(rowsStarted);
      }
    });
  });

  it('renders CJK names and unknown glyphs without failing', async () => {
    const inv = {
      ...make(),
      buyer: { name: 'Anna 🍕', address: null },
      lines: [{ ...make().lines[0], name: '寿司', productName: '寿司' }],
    };
    const text = await allText(await renderInvoicePdf(inv));
    expect(text).toContain('寿司');
    expect(text).toContain('Anna ?');
  });

  it('prints English wording for an English shop', async () => {
    const { language: _l, ...noLanguage } = ACCEPTED_CARD_ORDER;
    const inv = make(noLanguage, {
      ...CARD_SHOP,
      menuLanguages: ['en'],
    });
    const text = await allText(await renderInvoicePdf(inv));
    expect(text).toContain('Invoice number');
    expect(text).toContain('USt-IdNr. / VAT ID: DE123456789');
    expect(text).toContain('Thank you for your order.');
    expect(text).toContain(
      'Paid on 20.11.2026 by online payment (Stripe, transaction pi_1).',
    );
  });
});
