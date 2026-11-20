import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import subsetFont = require('subset-font');
import {
  INVOICE_TEMPLATE_VERSION_V1,
  invoiceTextLines,
  invoiceV2Table,
} from '../../domain/invoice/invoice';
import type { InvoiceDoc } from '../../domain/invoice/invoice';
import { cleanText, splitIntoRuns, wrapText } from './textRuns';
import type { TextRun } from './textRuns';
import { loadFace } from './invoiceFonts';
import { INVOICE_TOKENS_V2 as TOKENS_V2, hexToRgb } from './invoiceTokensV2';
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
export async function renderInvoicePdfV1(inv: InvoiceDoc): Promise<Uint8Array> {
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
    const sub = await subsetFont(face.bytes, [...chars].join(''), {
      targetFormat: 'sfnt',
      noLayoutClosure: true,
    });
    fonts.set(
      face,
      await pdf.embedFont(sub, {
        subset: false,
        customName: face.postscriptName,
      }),
    );
  }
  const fontOf = (f: FontFace): PDFFont => fonts.get(f) as PDFFont;
  const width = (runs: TextRun<FontFace>[], size: number): number =>
    runs.reduce(
      (w, r) => w + fontOf(r.face).widthOfTextAtSize(r.text, size),
      0,
    );

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const ensureRoom = (): void => {
    if (y < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };
  const drawRuns = (
    runs: TextRun<FontFace>[],
    x: number,
    size: number,
  ): void => {
    let cx = x;
    for (const r of runs) {
      const font = fontOf(r.face);
      page.drawText(r.text, { x: cx, y, size, font, color: rgb(0, 0, 0) });
      cx += font.widthOfTextAtSize(r.text, size);
    }
  };
  const line = (
    value: string,
    chain: FontFace[] = regularChain,
    size = BODY,
  ): void => {
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
    const wrapped = wrapText(cleanText(item.text), ITEM_WIDTH, (s) =>
      width(splitIntoRuns(s, regularChain), BODY),
    );
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

/** Dispatches on the version stamped on the stored invoice, so old invoices keep their original look. */
export async function renderInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  return inv.templateVersion === INVOICE_TEMPLATE_VERSION_V1
    ? renderInvoicePdfV1(inv)
    : renderInvoicePdfV2(inv);
}

// ───────────────────────────── V2 ("Restaurant Ordering") ─────────────────────────────

const colorOf = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
};
const C = {
  ink: colorOf(TOKENS_V2.ink),
  muted: colorOf(TOKENS_V2.muted),
  hairline: colorOf(TOKENS_V2.hairline),
  brandSoft: colorOf(TOKENS_V2.brandSoft),
  darkBar: colorOf(TOKENS_V2.darkBar),
  onDarkBar: colorOf(TOKENS_V2.onDarkBar),
};

const X0 = MARGIN;
const X1 = PAGE.width - MARGIN;
const CONTENT_W = X1 - X0;
const ROW_H = 22;
const LINE_H = 12; // extra height per wrapped description line
const TITLE_BAR_H = 44;
const HAIR = 0.75;
const END_GAP = 8; // gap between the last row and the settlement block

interface RowLayout {
  lines: Array<Array<{ text: string; muted: boolean }>>;
  height: number;
}
interface Pagination {
  pages: number[][]; // row indexes per page
  endOnOwnPage: boolean;
}

export async function renderInvoicePdfV2(inv: InvoiceDoc): Promise<Uint8Array> {
  const t = invoiceV2Table(inv);
  const title = `${t.title} ${inv.number}`;

  const boldStrings = [
    title,
    t.title,
    t.sellerName,
    t.settlement.badge,
    t.settlement.total,
    ...Object.values(t.columns),
    ...t.footer.map((c) => c.heading),
  ];
  const regularStrings = [
    t.priceNote,
    t.sellerAddressLine,
    ...t.buyer,
    ...t.meta.flatMap((m) => [m.label, m.value]),
    ...t.notes,
    ...t.rows.flatMap((r) => [
      r.name,
      r.modifiers,
      String(r.pos),
      String(r.quantity),
      r.unit,
      r.rate,
      r.total,
      '·',
    ]),
    t.settlement.note,
    t.settlement.net,
    ...t.settlement.taxLines,
    t.closing,
    ...t.footer.flatMap((c) => c.lines),
    `${inv.language === 'de' ? 'Seite' : 'Page'} 0123456789 ${inv.language === 'de' ? 'von' : 'of'}`,
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
    const sub = await subsetFont(face.bytes, [...chars].join(''), {
      targetFormat: 'sfnt',
      noLayoutClosure: true,
    });
    fonts.set(
      face,
      await pdf.embedFont(sub, {
        subset: false,
        customName: face.postscriptName,
      }),
    );
  }
  const fontOf = (f: FontFace): PDFFont => fonts.get(f) as PDFFont;
  const widthOfRuns = (runs: TextRun<FontFace>[], size: number): number =>
    runs.reduce(
      (w, r) => w + fontOf(r.face).widthOfTextAtSize(r.text, size),
      0,
    );
  const textWidth = (value: string, chain: FontFace[], size: number): number =>
    widthOfRuns(splitIntoRuns(value, chain), size);

  let page = pdf.addPage([PAGE.width, PAGE.height]);

  const drawText = (
    value: string,
    x: number,
    y: number,
    size: number,
    chain: FontFace[],
    color = C.ink,
  ): void => {
    let cx = x;
    for (const r of splitIntoRuns(value, chain)) {
      const font = fontOf(r.face);
      page.drawText(r.text, { x: cx, y, size, font, color });
      cx += font.widthOfTextAtSize(r.text, size);
    }
  };
  const drawRight = (
    value: string,
    rightX: number,
    y: number,
    size: number,
    chain: FontFace[],
    color = C.ink,
  ): void =>
    drawText(
      value,
      rightX - textWidth(value, chain, size),
      y,
      size,
      chain,
      color,
    );
  const hairline = (y: number, x0 = X0, x1 = X1): void =>
    page.drawLine({
      start: { x: x0, y },
      end: { x: x1, y },
      thickness: HAIR,
      color: C.hairline,
    });

  // The wordmark square is the only place the brand colour is used.
  const drawWordmark = (x: number, baseline: number): number => {
    page.drawRectangle({
      x,
      y: baseline - 1,
      width: 10,
      height: 10,
      color: colorOf(TOKENS_V2.brand),
    });
    drawText(t.sellerName, x + 16, baseline, 12, boldChain);
    return x + 16 + textWidth(t.sellerName, boldChain, 12);
  };
  // The Bezahlt badge is the only place the positive (green) colour is used.
  const drawBadge = (x: number, top: number): number => {
    const green = colorOf(TOKENS_V2.positive);
    const w = textWidth(t.settlement.badge, boldChain, 9) + 16;
    page.drawRectangle({
      x,
      y: top - 18,
      width: w,
      height: 18,
      borderColor: green,
      borderWidth: 1,
    });
    drawText(t.settlement.badge, x + 8, top - 13, 9, boldChain, green);
    return 18;
  };

  const wrap = (
    value: string,
    maxWidth: number,
    chain: FontFace[],
    size: number,
  ): string[] =>
    wrapText(cleanText(value), maxWidth, (s) => textWidth(s, chain, size));

  // ── geometry shared by the dry run and the drawing pass ──
  const columnsFor = (withUnit: boolean) => {
    const totalR = X1 - 6;
    const rateR = totalR - 72;
    const unitR = withUnit ? rateR - 62 : rateR;
    const qtyR = withUnit ? unitR - 78 : rateR - 62;
    const descX = X0 + 34;
    const descW = qtyR - 36 - descX;
    return { totalR, rateR, unitR, qtyR, descX, descW, withUnit };
  };

  const rowLayout = (i: number, descW: number): RowLayout => {
    const r = t.rows[i];
    const words: Array<{ text: string; muted: boolean }> = [];
    for (const w of cleanText(r.name).split(' '))
      if (w !== '') words.push({ text: w, muted: false });
    if (r.modifiers) {
      words.push({ text: '·', muted: true });
      for (const w of cleanText(r.modifiers).split(' '))
        if (w !== '') words.push({ text: w, muted: true });
    }
    const space = textWidth(' ', regularChain, BODY);
    const lines: RowLayout['lines'] = [];
    let cur: RowLayout['lines'][number] = [];
    let curW = 0;
    const flush = (): void => {
      if (cur.length) lines.push(cur);
      cur = [];
      curW = 0;
    };
    for (const w of words) {
      // a single word wider than the column is broken between code points
      const pieces: string[] = [];
      if (textWidth(w.text, regularChain, BODY) <= descW) pieces.push(w.text);
      else {
        let chunk = '';
        for (const ch of w.text) {
          if (
            chunk !== '' &&
            textWidth(chunk + ch, regularChain, BODY) > descW
          ) {
            pieces.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        pieces.push(chunk);
      }
      for (const piece of pieces) {
        const pw = textWidth(piece, regularChain, BODY);
        const add = cur.length ? space + pw : pw;
        if (cur.length && curW + add > descW) flush();
        curW += cur.length ? space + pw : pw;
        cur.push({ text: piece, muted: w.muted });
      }
    }
    flush();
    if (!lines.length) lines.push([]);
    return { lines, height: ROW_H + (lines.length - 1) * LINE_H };
  };

  // top block (page 1): header, buyer + meta, notes, title bar
  const y0 = PAGE.height - MARGIN;
  const notesWrapped = t.notes.flatMap((n) =>
    wrap(n, CONTENT_W, regularChain, 9),
  );
  const buyerH = t.buyer.length * 14;
  const metaH = t.meta.length * 14;
  const notesH = notesWrapped.length ? notesWrapped.length * 12 + 6 : 0;
  const blockTop = y0 - 32;
  const titleBarTop = blockTop - Math.max(buyerH, metaH) - notesH - 8;
  const firstTableTop = titleBarTop - TITLE_BAR_H - 8;
  const nextTableTop = y0 - 30;

  // end block (settlement, closing, footer)
  const noteW = 240;
  const noteLines = wrap(t.settlement.note, noteW, regularChain, 9);
  const leftH = 18 + 8 + noteLines.length * 12;
  const rightH = (1 + t.settlement.taxLines.length) * 14 + 8 + 28;
  const colW = CONTENT_W / 3;
  const footerCols = t.footer.map((c) => ({
    heading: c.heading,
    lines: c.lines.flatMap((l) => wrap(l, colW - 14, regularChain, 9)),
  }));
  const footerH = footerCols.length
    ? 12 + Math.max(...footerCols.map((c) => 14 + c.lines.length * 12))
    : 0;
  const endH = Math.max(leftH, rightH) + 14 + 14 + (footerH ? 18 + footerH : 0);

  const paginate = (withUnit: boolean): Pagination => {
    const { descW } = columnsFor(withUnit);
    const pages: number[][] = [];
    let cur: number[] = [];
    let y = firstTableTop - ROW_H; // below the table header
    for (let i = 0; i < t.rows.length; i++) {
      const h = rowLayout(i, descW).height;
      if (y - h < MARGIN && cur.length > 0) {
        pages.push(cur);
        cur = [];
        y = nextTableTop - ROW_H;
      }
      cur.push(i);
      y -= h;
    }
    pages.push(cur);
    const endOnOwnPage = y - END_GAP - endH < MARGIN;
    return { pages, endOnOwnPage };
  };
  const pageCountOf = (p: Pagination): number =>
    p.pages.length + (p.endOnOwnPage ? 1 : 0);

  let withUnit = true;
  let plan = paginate(true);
  // Three or more pages: free the Einzelpreis column's width for the description before anything else gives.
  if (pageCountOf(plan) > 2) {
    withUnit = false;
    plan = paginate(false);
  }
  const cols = columnsFor(withUnit);
  const totalPages = pageCountOf(plan);

  // ── drawing pass ──
  const de = inv.language === 'de';
  const drawTableHeader = (top: number): number => {
    page.drawRectangle({
      x: X0,
      y: top - ROW_H,
      width: CONTENT_W,
      height: ROW_H,
      color: C.brandSoft,
    });
    const base = top - 15;
    drawText(t.columns.pos, X0 + 6, base, 9, boldChain);
    drawText(t.columns.description, cols.descX, base, 9, boldChain);
    drawRight(t.columns.quantity, cols.qtyR, base, 9, boldChain);
    if (cols.withUnit)
      drawRight(t.columns.unit, cols.unitR, base, 9, boldChain);
    drawRight(t.columns.rate, cols.rateR, base, 9, boldChain);
    drawRight(t.columns.total, cols.totalR, base, 9, boldChain);
    hairline(top - ROW_H);
    return top - ROW_H;
  };

  const drawRow = (i: number, top: number): number => {
    const r = t.rows[i];
    const layout = rowLayout(i, cols.descW);
    const base = top - 15;
    drawText(String(r.pos), X0 + 6, base, BODY, regularChain);
    const space = textWidth(' ', regularChain, BODY);
    layout.lines.forEach((ln, li) => {
      let cx = cols.descX;
      ln.forEach((w, wi) => {
        drawText(
          w.text,
          cx,
          base - li * LINE_H,
          BODY,
          regularChain,
          w.muted ? C.muted : C.ink,
        );
        cx +=
          textWidth(w.text, regularChain, BODY) +
          (wi < ln.length - 1 ? space : 0);
      });
    });
    drawRight(String(r.quantity), cols.qtyR, base, BODY, regularChain);
    if (cols.withUnit) drawRight(r.unit, cols.unitR, base, BODY, regularChain);
    drawRight(r.rate, cols.rateR, base, BODY, regularChain);
    drawRight(r.total, cols.totalR, base, BODY, regularChain);
    hairline(top - layout.height);
    return top - layout.height;
  };

  const drawFirstHeader = (): void => {
    const base = y0 - 10;
    drawWordmark(X0, base);
    drawRight(t.sellerAddressLine, X1, base, 9, regularChain, C.muted);
    hairline(y0 - 22);

    t.buyer.forEach((l, i) =>
      drawText(
        l,
        X0,
        blockTop - 10 - i * 14,
        i === 0 ? 11 : BODY,
        regularChain,
      ),
    );
    const labelX = 300;
    t.meta.forEach((m, i) => {
      const y = blockTop - 10 - i * 14;
      drawText(m.label, labelX, y, 9, regularChain, C.muted);
      drawRight(m.value, X1, y, 9, regularChain);
    });
    const blockBottom = blockTop - Math.max(buyerH, metaH);
    notesWrapped.forEach((n, i) =>
      drawText(n, X0, blockBottom - 12 - i * 12, 9, regularChain, C.muted),
    );

    page.drawRectangle({
      x: X0,
      y: titleBarTop - TITLE_BAR_H,
      width: CONTENT_W,
      height: TITLE_BAR_H,
      color: C.brandSoft,
    });
    const base2 = titleBarTop - TITLE_BAR_H / 2 - 6;
    drawText(t.title, X0 + 12, base2, 18, boldChain);
    drawRight(t.priceNote, X1 - 12, base2 + 1, 9, regularChain, C.muted);
  };

  const drawRunningHeader = (n: number): void => {
    const base = y0 - 10;
    const wordEnd = drawWordmark(X0, base);
    drawText(title, wordEnd + 24, base, 9, regularChain, C.muted);
    drawRight(
      `${de ? 'Seite' : 'Page'} ${n} ${de ? 'von' : 'of'} ${totalPages}`,
      X1,
      base,
      9,
      regularChain,
      C.muted,
    );
    hairline(y0 - 22);
  };

  const drawEndBlock = (topY: number): void => {
    let y = topY;
    const left = X0;
    const rightCol = 300;
    // left column: badge + note
    const bh = drawBadge(left, y);
    noteLines.forEach((l, i) =>
      drawText(l, left, y - bh - 14 - i * 12, 9, regularChain, C.muted),
    );
    // right column: net, VAT per rate, total bar
    let ry = y - 10;
    drawRight(t.settlement.net, X1, ry, BODY, regularChain);
    for (const l of t.settlement.taxLines) {
      ry -= 14;
      drawRight(l, X1, ry, BODY, regularChain);
    }
    const barTop = ry - 10;
    page.drawRectangle({
      x: rightCol,
      y: barTop - 28,
      width: X1 - rightCol,
      height: 28,
      color: C.darkBar,
    });
    drawRight(
      t.settlement.total,
      X1 - 10,
      barTop - 18,
      11,
      boldChain,
      C.onDarkBar,
    );
    y -= Math.max(leftH, rightH) + 14;
    drawText(t.closing, X0, y, 11, regularChain);
    y -= 14;
    if (footerCols.length) {
      y -= 8;
      hairline(y);
      y -= 14;
      footerCols.forEach((c, i) => {
        const x = X0 + i * colW;
        drawText(c.heading, x, y, 9, boldChain);
        c.lines.forEach((l, li) =>
          drawText(l, x, y - 12 - li * 12, 9, regularChain, C.muted),
        );
      });
    }
  };

  plan.pages.forEach((rowIdx, pi) => {
    if (pi > 0) page = pdf.addPage([PAGE.width, PAGE.height]);
    let y: number;
    if (pi === 0) {
      drawFirstHeader();
      y = drawTableHeader(firstTableTop);
    } else {
      drawRunningHeader(pi + 1);
      y = drawTableHeader(nextTableTop);
    }
    for (const i of rowIdx) y = drawRow(i, y);
    if (pi === plan.pages.length - 1) {
      if (plan.endOnOwnPage) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        drawRunningHeader(plan.pages.length + 1);
        drawEndBlock(nextTableTop);
      } else drawEndBlock(y - END_GAP);
    }
  });

  return pdf.save();
}
