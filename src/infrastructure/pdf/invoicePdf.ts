import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import subsetFont = require('subset-font');
import { invoiceTextLines } from '../../domain/invoice/invoice';
import type { InvoiceDoc } from '../../domain/invoice/invoice';
import { cleanText, splitIntoRuns, wrapText } from './textRuns';
import type { TextRun } from './textRuns';
import { loadFace } from './invoiceFonts';
import type { FontFace } from './invoiceFonts';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const BODY = 10;
const LEADING = 14;

/**
 * One A4 document in embedded Noto Sans (Latin/Greek/Cyrillic), with Noto Sans CJK SC as fallback only when the
 * text needs it. Each character uses the first font that has it; a character no font has prints '?'.
 * Fonts are cut down with HarfBuzz (subset-font) to the characters drawn, never with pdf-lib's own subset option,
 * which makes PDFs that macOS Preview and iOS Mail draw with missing letters.
 */
export async function renderInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  const text = invoiceTextLines(inv);
  const title = `${text.title} ${inv.number}`;
  const totalX = PAGE.width - MARGIN;
  const unitX = totalX - 90;
  const rateX = totalX - 190;
  const ITEM_WIDTH = rateX - MARGIN - 70;

  const boldStrings = [title, ...text.seller.slice(0, 1), ...text.totals];
  const regularStrings = [
    ...text.seller.slice(1),
    ...text.buyer,
    ...text.meta,
    ...text.items.flatMap((i) => [i.text, i.rate, i.unit, i.total]),
    ...text.footer,
  ];

  const latin = loadFace('latin');
  const latinBold = loadFace('latinBold');
  const needsFallback = [...boldStrings, ...regularStrings].some((s) =>
    [...cleanText(s)].some((ch) => !latin.covers(ch.codePointAt(0) as number)),
  );
  const cjk = needsFallback ? loadFace('cjk') : null;
  const regularChain: FontFace[] = cjk ? [latin, cjk] : [latin];
  const boldChain: FontFace[] = cjk ? [latinBold, cjk] : [latinBold];

  const used = new Map<FontFace, Set<string>>();
  const collect = (strings: string[], chain: FontFace[]): void => {
    for (const s of strings)
      for (const r of splitIntoRuns(s, chain)) {
        const set = used.get(r.face) ?? new Set<string>();
        for (const ch of r.text) set.add(ch);
        used.set(r.face, set);
      }
  };
  collect(boldStrings, boldChain);
  collect(regularStrings, regularChain);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setProducer('restaurant-ordering-system');
  pdf.setCreationDate(new Date(inv.issuedAt));

  const fonts = new Map<FontFace, PDFFont>();
  for (const [face, chars] of used) {
    const sub = await subsetFont(face.bytes, [...chars].join(''), { targetFormat: 'sfnt', noLayoutClosure: true });
    fonts.set(face, await pdf.embedFont(sub, { subset: false, customName: face.postscriptName }));
  }
  const fontOf = (f: FontFace): PDFFont => fonts.get(f) as PDFFont;
  const width = (runs: TextRun<FontFace>[], size: number): number =>
    runs.reduce((w, r) => w + fontOf(r.face).widthOfTextAtSize(r.text, size), 0);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const ensureRoom = (): void => {
    if (y < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };
  const drawRuns = (runs: TextRun<FontFace>[], x: number, size: number): void => {
    let cx = x;
    for (const r of runs) {
      const font = fontOf(r.face);
      page.drawText(r.text, { x: cx, y, size, font, color: rgb(0, 0, 0) });
      cx += font.widthOfTextAtSize(r.text, size);
    }
  };
  const line = (value: string, chain: FontFace[] = regularChain, size = BODY): void => {
    ensureRoom();
    drawRuns(splitIntoRuns(value, chain), MARGIN, size);
    y -= LEADING;
  };
  const rightAligned = (value: string, atX: number): void => {
    const runs = splitIntoRuns(value, regularChain);
    drawRuns(runs, atX - width(runs, BODY), BODY);
  };

  line(title, boldChain, 18);
  y -= 6;
  text.seller.forEach((l, i) => line(l, i === 0 ? boldChain : regularChain));
  y -= 6;
  text.buyer.forEach((l) => line(l));
  y -= 6;
  text.meta.forEach((l) => line(l));
  y -= 8;

  for (const item of text.items) {
    const wrapped = wrapText(cleanText(item.text), ITEM_WIDTH, (s) => width(splitIntoRuns(s, regularChain), BODY));
    ensureRoom();
    drawRuns(splitIntoRuns(wrapped[0], regularChain), MARGIN, BODY);
    rightAligned(item.rate, rateX);
    rightAligned(item.unit, unitX);
    rightAligned(item.total, totalX);
    y -= LEADING;
    for (const more of wrapped.slice(1)) {
      ensureRoom();
      drawRuns(splitIntoRuns(more, regularChain), MARGIN, BODY);
      y -= LEADING;
    }
  }
  y -= 8;
  text.totals.forEach((l) => line(l, boldChain));
  y -= 8;
  text.footer.forEach((l) => line(l));

  return pdf.save();
}
