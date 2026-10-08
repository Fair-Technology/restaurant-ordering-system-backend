import type { MenuLanguage } from '../reference/ReferenceLists';
import type { Shop } from '../shop/Shop';
import { hasInvoiceTaxId, invoiceTaxIdsOf, legalOf } from '../legal/legalTexts';
import { chargedCents } from '../order/Order';
import type {
  CustomerAddress,
  FulfilmentMode,
  Order,
  OrderItem,
  TaxBreakdownEntry,
} from '../order/Order';
import { baseByRate, refundPartsByRate } from '../order/refundAllocation';
import type { RefundShape } from '../order/refundAllocation';
import { buildTaxBreakdown, extractVatCents } from '../order/tax';

export const INVOICE_TEMPLATE_VERSION = 'receipt-2026-10';

export type InvoiceDocumentType = 'invoice' | 'cancellation' | 'correction';

export interface InvoiceCounterDoc {
  id: 'counter';
  shopId: string;
  kind: 'counter';
  year: string;
  nextNumber: number;
  updatedAt: string;
}

export interface InvoiceSeller {
  legalName: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatId: string;
  taxNumber: string;
  registerCourt: string;
  registerNumber: string;
}

export interface InvoiceBuyer {
  name: string;
  address: CustomerAddress | null;
}

export interface InvoiceLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  taxRateBasisPoints: number;
  taxCents: number;
}

export interface InvoiceDoc {
  id: string;
  shopId: string;
  kind: 'invoice';
  documentType: InvoiceDocumentType;
  number: string;
  templateVersion: typeof INVOICE_TEMPLATE_VERSION;
  issuedAt: string; // ISO
  supplyDate: string; // ISO
  timezone: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  taxBreakdown: TaxBreakdownEntry[];
  totalCents: number;
  currency: string;
  payment: { method: 'card'; stripePaymentIntentId: string };
  orderRef: string;
  fulfilmentMode: FulfilmentMode;
  language: MenuLanguage;
  corrects: { number: string; issuedAt: string } | null;
  refundId: string | null;
}

export const INVOICE_TAX_ID_MISSING =
  'The restaurant has no tax number or VAT ID for invoices';

/** The calendar year of `now` in the restaurant's time zone, e.g. '2027' at 00:30 on 1 Jan in Berlin. */
export function yearKeyOf(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(
    now,
  );
}

export function formatInvoiceNumber(year: string, sequence: number): string {
  return `R-${year}-${String(sequence).padStart(5, '0')}`;
}

/** The counter restarts at 1 whenever the year changes (or nothing was issued yet). */
export function nextSequence(
  counter: Pick<InvoiceCounterDoc, 'year' | 'nextNumber'> | null,
  year: string,
): number {
  return !counter || counter.year !== year ? 1 : counter.nextNumber;
}

function itemName(item: OrderItem): string {
  const variant = item.selectedVariantOptionName
    ? ` (${item.selectedVariantOptionName})`
    : '';
  const addons = item.selectedAddonOptionNames?.length
    ? ` + ${item.selectedAddonOptionNames.join(', ')}`
    : '';
  return `${item.productName}${variant}${addons}`;
}

/** Invoice line i is order item i, in the same order with no grouping: item refunds rely on it. Charges follow the items. */
export function buildInvoice(input: {
  order: Order;
  shop: Shop;
  number: string;
  now: Date;
}): InvoiceDoc {
  const { order, shop, number, now } = input;
  const impressum = legalOf(shop).impressum;
  if (!impressum) throw new Error('Shop has no Impressum');
  if (!hasInvoiceTaxId(shop)) throw new Error(INVOICE_TAX_ID_MISSING);
  if (order.payment.method !== 'card' || !order.payment.stripePaymentIntentId) {
    throw new Error('Order has no card payment');
  }
  const ids = invoiceTaxIdsOf(shop);
  const issuedAt = now.toISOString();
  return {
    id: order.id,
    shopId: order.shopId,
    kind: 'invoice',
    documentType: 'invoice',
    number,
    templateVersion: INVOICE_TEMPLATE_VERSION,
    issuedAt,
    supplyDate: order.acceptedAt ?? issuedAt,
    timezone: shop.timezone,
    seller: {
      legalName: impressum.legalName,
      street: impressum.street,
      postcode: impressum.postcode,
      city: impressum.city,
      country: impressum.country,
      phone: impressum.phone,
      email: impressum.email,
      vatId: ids.vatId,
      taxNumber: ids.taxNumber,
      registerCourt: impressum.registerCourt,
      registerNumber: impressum.registerNumber,
    },
    buyer: { name: order.customerName, address: order.customerAddress ?? null },
    lines: order.items.map((item) => ({
      name: itemName(item),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      taxRateBasisPoints: item.taxRateBasisPoints ?? 0,
      taxCents: item.taxCents ?? 0,
    })).concat(
      (order.charges ?? []).map((c) => ({
        name: (order.language ?? 'de') === 'de' ? 'Liefergebühr' : 'Delivery fee',
        quantity: 1,
        unitPriceCents: c.grossCents,
        lineTotalCents: c.grossCents,
        taxRateBasisPoints: c.taxRateBasisPoints,
        taxCents: c.taxCents,
      })),
    ),
    taxBreakdown: order.taxBreakdown ?? buildTaxBreakdown(order.items),
    totalCents: chargedCents(order),
    currency: order.currency,
    payment: {
      method: 'card',
      stripePaymentIntentId: order.payment.stripePaymentIntentId,
    },
    orderRef: order.orderRef,
    fulfilmentMode: order.fulfilmentMode,
    language: order.language ?? 'de',
    corrects: null,
    refundId: null,
  };
}

function rateLabel(rateBasisPoints: number, de: boolean): string {
  const locale = de ? 'de-DE' : 'en-GB';
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      rateBasisPoints / 100,
    ) + (de ? ' %' : '%')
  );
}

function breakdownOf(lines: ReadonlyArray<InvoiceLine>): TaxBreakdownEntry[] {
  const byRate = new Map<number, TaxBreakdownEntry>();
  for (const l of lines) {
    const entry = byRate.get(l.taxRateBasisPoints) ?? {
      rateBasisPoints: l.taxRateBasisPoints,
      grossCents: 0,
      taxCents: 0,
    };
    entry.grossCents += l.lineTotalCents;
    entry.taxCents += l.taxCents;
    byRate.set(l.taxRateBasisPoints, entry);
  }
  return [...byRate.values()].sort(
    (a, b) => a.rateBasisPoints - b.rateBasisPoints,
  );
}

/**
 * The correction invoice for refund `index` of `refunds`.
 * The first refund covering the whole invoice is a Stornorechnung ('cancellation', every line negated);
 * anything else is a Rechnungskorrektur: ticked items at their own rate, or one "Teilerstattung" line per rate.
 */
export function buildCorrection(input: {
  original: InvoiceDoc;
  refunds: ReadonlyArray<RefundShape>;
  index: number;
  refundId: string;
  number: string;
  now: Date;
}): InvoiceDoc {
  const { original, refunds, index, refundId, number, now } = input;
  const refund = refunds[index];
  const de = original.language === 'de';
  const full = index === 0 && refund.amountCents === original.totalCents;
  let documentType: InvoiceDocumentType;
  let lines: InvoiceLine[];
  let taxBreakdown: TaxBreakdownEntry[];
  if (full) {
    documentType = 'cancellation';
    lines = original.lines.map((l) => ({
      ...l,
      unitPriceCents: -l.unitPriceCents,
      lineTotalCents: -l.lineTotalCents,
      taxCents: -l.taxCents,
    }));
    taxBreakdown = original.taxBreakdown.map((e) => ({
      rateBasisPoints: e.rateBasisPoints,
      grossCents: -e.grossCents,
      taxCents: -e.taxCents,
    }));
  } else {
    documentType = 'correction';
    if (refund.lines) {
      lines = refund.lines.map((l) => ({
        name: original.lines[l.lineIndex].name,
        quantity: l.quantity,
        unitPriceCents: -original.lines[l.lineIndex].unitPriceCents,
        lineTotalCents: -l.grossCents,
        taxRateBasisPoints: l.taxRateBasisPoints,
        taxCents: -extractVatCents(l.grossCents, l.taxRateBasisPoints),
      }));
    } else {
      const parts = refundPartsByRate(
        baseByRate(original.taxBreakdown),
        refunds,
        index,
      );
      lines = parts.map((p) => ({
        name: `${de ? 'Teilerstattung' : 'Partial refund'} (${rateLabel(p.rateBasisPoints, de)})`,
        quantity: 1,
        unitPriceCents: -p.grossCents,
        lineTotalCents: -p.grossCents,
        taxRateBasisPoints: p.rateBasisPoints,
        taxCents: -extractVatCents(p.grossCents, p.rateBasisPoints),
      }));
    }
    taxBreakdown = breakdownOf(lines);
  }
  return {
    id: `${original.id}-c${index + 1}`,
    shopId: original.shopId,
    kind: 'invoice',
    documentType,
    number,
    templateVersion: INVOICE_TEMPLATE_VERSION,
    issuedAt: now.toISOString(),
    supplyDate: original.supplyDate,
    timezone: original.timezone,
    seller: original.seller,
    buyer: original.buyer,
    lines,
    taxBreakdown,
    totalCents: -refund.amountCents,
    currency: original.currency,
    payment: original.payment,
    orderRef: original.orderRef,
    fulfilmentMode: original.fulfilmentMode,
    language: original.language,
    corrects: { number: original.number, issuedAt: original.issuedAt },
    refundId,
  };
}

export function invoiceTitle(
  type: InvoiceDocumentType,
  lang: MenuLanguage,
): string {
  const titles: Record<InvoiceDocumentType, { de: string; en: string }> = {
    invoice: { de: 'Rechnung', en: 'Invoice' },
    cancellation: { de: 'Stornorechnung', en: 'Cancellation invoice' },
    correction: { de: 'Rechnungskorrektur', en: 'Correction invoice' },
  };
  return titles[type][lang];
}

export interface InvoiceText {
  title: string;
  seller: string[];
  buyer: string[];
  meta: string[];
  items: Array<{ text: string; unit: string; total: string; rate: string }>;
  totals: string[];
  footer: string[];
}

/** Everything printed on the document, already formatted for its language and the restaurant's time zone. */
export function invoiceTextLines(inv: InvoiceDoc): InvoiceText {
  const de = inv.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';
  const moneyFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: inv.currency,
  });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    timeZone: inv.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const money = (cents: number): string => moneyFormat.format(cents / 100);
  const date = (iso: string): string => dateFormat.format(new Date(iso));
  const rate = (bp: number): string => rateLabel(bp, de);
  const isCorrection = inv.documentType !== 'invoice';
  const s = inv.seller;

  const seller = [
    s.legalName,
    s.street,
    `${s.postcode} ${s.city}`.trim(),
    s.country,
    s.vatId ? `${de ? 'USt-IdNr.' : 'VAT ID'}: ${s.vatId}` : '',
    s.taxNumber ? `${de ? 'Steuernummer' : 'Tax number'}: ${s.taxNumber}` : '',
    s.registerCourt && s.registerNumber
      ? `${s.registerCourt} ${s.registerNumber}`
      : '',
    s.phone ? `${de ? 'Tel.' : 'Phone'}: ${s.phone}` : '',
    s.email ? `${de ? 'E-Mail' : 'Email'}: ${s.email}` : '',
  ].filter((line) => line !== '');

  const a = inv.buyer.address;
  const buyer = [
    `${de ? 'Kunde' : 'Customer'}: ${inv.buyer.name}`,
    ...(a ? [a.street, `${a.postcode} ${a.city}`, a.country] : []),
  ];

  const meta = [
    `${de ? 'Rechnungsnummer' : 'Invoice number'}: ${inv.number}`,
    `${de ? 'Rechnungsdatum' : 'Invoice date'}: ${date(inv.issuedAt)}`,
    `${de ? 'Leistungsdatum' : 'Date of supply'}: ${date(inv.supplyDate)}`,
    `${de ? 'Bestellung' : 'Order'}: ${inv.orderRef}`,
  ];
  if (inv.corrects) {
    meta.push(
      de
        ? `Bezieht sich auf Rechnung ${inv.corrects.number} vom ${date(inv.corrects.issuedAt)}`
        : `Relates to invoice ${inv.corrects.number} of ${date(inv.corrects.issuedAt)}`,
    );
  }

  const items = inv.lines.map((l) => ({
    text: `${l.quantity} × ${l.name}`,
    unit: money(l.unitPriceCents),
    total: money(l.lineTotalCents),
    rate: rate(l.taxRateBasisPoints),
  }));

  const totals: string[] = [];
  for (const e of inv.taxBreakdown) {
    const label = rate(e.rateBasisPoints);
    totals.push(
      `${de ? 'Nettobetrag' : 'Net amount'} ${label}: ${money(e.grossCents - e.taxCents)}`,
    );
    totals.push(`${de ? 'USt.' : 'VAT'} ${label}: ${money(e.taxCents)}`);
  }
  const totalLabel = isCorrection
    ? de
      ? 'Korrekturbetrag (brutto)'
      : 'Correction total (gross)'
    : de
      ? 'Gesamtbetrag (brutto)'
      : 'Total (gross)';
  totals.push(`${totalLabel}: ${money(inv.totalCents)}`);

  const paidLine = isCorrection
    ? de
      ? `Erstattet am ${date(inv.issuedAt)} auf die ursprüngliche Zahlungsart.`
      : `Refunded on ${date(inv.issuedAt)} to the original payment method.`
    : de
      ? `Bezahlt am ${date(inv.issuedAt)} per Online-Zahlung (Stripe).`
      : `Paid on ${date(inv.issuedAt)} by online payment (Stripe).`;
  const footer = [
    paidLine,
    de
      ? `Diese Rechnung wurde im Namen von ${s.legalName} erstellt.`
      : `This document was issued on behalf of ${s.legalName}.`,
  ];

  return {
    title: invoiceTitle(inv.documentType, inv.language),
    seller,
    buyer,
    meta,
    items,
    totals,
    footer,
  };
}

// Characters beyond Latin-1 that the PDF's standard font (WinAnsi, Windows-1252) can still show.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Replaces every character the PDF font cannot show with '?' (one per character, emoji included). */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (/\s/.test(ch) && code !== 0xa0) out += ' ';
    else if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WIN_ANSI_EXTRAS.has(ch)
    )
      out += ch;
    else out += '?';
  }
  return out;
}

export function invoiceFileName(
  inv: Pick<InvoiceDoc, 'number' | 'language' | 'documentType'>,
): string {
  const title = invoiceTitle(inv.documentType, inv.language).replace(/ /g, '-');
  return `${title}-${inv.number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}
