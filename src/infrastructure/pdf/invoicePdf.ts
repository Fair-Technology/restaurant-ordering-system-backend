import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { invoiceTextLines, toWinAnsi } from '../../domain/invoice/invoice';
import type { InvoiceDoc } from '../../domain/invoice/invoice';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const BODY = 10;
const LEADING = 14;

/** One A4 document in Helvetica; every string goes through toWinAnsi first because the font cannot show anything else. */
export async function renderInvoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  const text = invoiceTextLines(inv);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = toWinAnsi(`${text.title} ${inv.number}`);
  pdf.setTitle(title);
  pdf.setProducer('restaurant-ordering-system');
  pdf.setCreationDate(new Date(inv.issuedAt));

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const right = PAGE.width - MARGIN;

  const ensureRoom = (): void => {
    if (y < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };
  const line = (value: string, font: PDFFont = regular, size = BODY): void => {
    ensureRoom();
    page.drawText(toWinAnsi(value), { x: MARGIN, y, size, font, color: rgb(0, 0, 0) });
    y -= LEADING;
  };
  const rightAligned = (value: string, atX: number, font: PDFFont = regular): void => {
    const safe = toWinAnsi(value);
    page.drawText(safe, { x: atX - font.widthOfTextAtSize(safe, BODY), y, size: BODY, font });
  };

  line(title, bold, 18);
  y -= 6;
  text.seller.forEach((l, i) => line(l, i === 0 ? bold : regular));
  y -= 6;
  text.buyer.forEach((l) => line(l));
  y -= 6;
  text.meta.forEach((l) => line(l));
  y -= 8;

  const totalX = right;
  const unitX = right - 90;
  const rateX = right - 190;
  for (const item of text.items) {
    ensureRoom();
    page.drawText(toWinAnsi(item.text), { x: MARGIN, y, size: BODY, font: regular, maxWidth: rateX - MARGIN - 70 });
    rightAligned(item.rate, rateX);
    rightAligned(item.unit, unitX);
    rightAligned(item.total, totalX);
    y -= LEADING;
  }
  y -= 8;
  text.totals.forEach((l) => line(l, bold));
  y -= 8;
  text.footer.forEach((l) => line(l));

  return pdf.save();
}
