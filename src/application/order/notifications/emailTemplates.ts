import { buildImpressumLines } from '../../../domain/legal/impressum';
import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import type { Order, RejectReason } from '../../../domain/order/Order';
import type { MenuLanguage } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';

export type OrderEmailKind =
  | 'order_received'
  | 'order_accepted'
  | 'order_ready'
  | 'order_rejected'
  | 'order_cancelled'
  | 'order_escalation';

export interface OrderEmailContent {
  subject: string;
  text: string;
  html: string;
}

type Bilingual = Record<MenuLanguage, string>;

const REJECT_SENTENCES: Record<RejectReason, Bilingual> = {
  too_busy: { de: 'Das Restaurant ist gerade zu ausgelastet.', en: 'The restaurant is too busy right now.' },
  item_unavailable: {
    de: 'Ein Artikel Ihrer Bestellung ist nicht mehr verfügbar.',
    en: 'An item in your order is no longer available.',
  },
  closing_soon: { de: 'Das Restaurant schließt in Kürze.', en: 'The restaurant is about to close.' },
  other: { de: 'Das Restaurant konnte Ihre Bestellung nicht annehmen.', en: 'The restaurant could not take your order.' },
  no_response: {
    de: 'Das Restaurant hat Ihre Bestellung nicht rechtzeitig bestätigt.',
    en: 'The restaurant did not confirm your order in time.',
  },
  payment_failed: {
    de: 'Die Zahlung konnte nicht abgebucht werden.',
    en: 'The payment could not be taken.',
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rejectionReasonOf(order: Order): RejectReason {
  const entry = [...order.history].reverse().find((h) => h.to === 'REJECTED');
  const reason = entry?.reason;
  return reason && reason in REJECT_SENTENCES ? (reason as RejectReason) : 'other';
}

type Block = { type: 'p'; text: string } | { type: 'items'; rows: string[] };

function render(subject: string, blocks: Block[]): OrderEmailContent {
  const text = blocks.map((b) => (b.type === 'p' ? b.text : b.rows.join('\n'))).join('\n\n');
  const html = blocks
    .map((b) =>
      b.type === 'p'
        ? `<p>${escapeHtml(b.text).replace(/\n/g, '<br>')}</p>`
        : `<table>${b.rows.map((r) => `<tr><td>${escapeHtml(r)}</td></tr>`).join('')}</table>`,
    )
    .join('');
  return { subject, text, html };
}

/** The three-minute "order waiting" email goes to the restaurant, in the restaurant's own language. */
function buildEscalationEmail(order: Order, shop: Shop, adminOrdersUrl: string): OrderEmailContent {
  const lang = menuLanguagesOf(shop)[0];
  const de = lang === 'de';
  const f = formatters(lang, order.currency, shop.timezone);
  const until = order.autoRejectAt ? f.time(order.autoRejectAt) : '';
  const subject = de
    ? `Bestellung ${order.orderRef} wartet seit 3 Minuten auf Annahme`
    : `Order ${order.orderRef} has been waiting 3 minutes`;
  return render(subject, [
    {
      type: 'p',
      text: de
        ? `Bestellung ${order.orderRef} (${f.money(order.subtotalCents)}) wartet seit 3 Minuten. Ohne Annahme wird sie um ${until} automatisch abgelehnt.`
        : `Order ${order.orderRef} (${f.money(order.subtotalCents)}) has been waiting 3 minutes. It will be declined automatically at ${until} unless you accept it.`,
    },
    { type: 'p', text: `${de ? 'Zu den Bestellungen' : 'Open orders'}: ${adminOrdersUrl}` },
  ]);
}

function formatters(lang: MenuLanguage, currency: string, timeZone: string) {
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' });
  return {
    money: (cents: number): string => money.format(cents / 100),
    time: (iso: string): string => time.format(new Date(iso)),
  };
}

export function buildOrderEmail(input: {
  kind: OrderEmailKind;
  order: Order;
  shop: Shop;
  customerOrderUrl: string;
  adminOrdersUrl: string;
}): OrderEmailContent {
  const { kind, order, shop } = input;
  if (kind === 'order_escalation') return buildEscalationEmail(order, shop, input.adminOrdersUrl);

  const lang = order.language ?? menuLanguagesOf(shop)[0];
  const de = lang === 'de';
  const pick = (b: Bilingual): string => b[lang];
  const f = formatters(lang, order.currency, shop.timezone);
  const ref = order.orderRef;
  const time = order.readyAt ? f.time(order.readyAt) : '';
  const name = shop.name;

  const subjects: Record<Exclude<OrderEmailKind, 'order_escalation'>, Bilingual> = {
    order_received: { de: `${name}: Bestellung ${ref} eingegangen`, en: `${name}: order ${ref} received` },
    order_accepted: {
      de: `${name}: Bestellung ${ref} angenommen – abholbereit um ${time}`,
      en: `${name}: order ${ref} accepted – ready at ${time}`,
    },
    order_ready: { de: `${name}: Bestellung ${ref} ist abholbereit`, en: `${name}: order ${ref} is ready to collect` },
    order_rejected: { de: `${name}: Bestellung ${ref} abgelehnt`, en: `${name}: order ${ref} declined` },
    order_cancelled: { de: `${name}: Bestellung ${ref} storniert`, en: `${name}: order ${ref} cancelled` },
  };

  let kindLine: string;
  switch (kind) {
    case 'order_received':
      kindLine = de
        ? `Ihre Bestellung ist eingegangen. ${name} bestätigt sie in Kürze.`
        : `Your order has been received. ${name} will confirm it shortly.`;
      break;
    case 'order_accepted':
      kindLine = de
        ? `Ihre Bestellung wurde angenommen und ist um ${time} abholbereit.`
        : `Your order has been accepted and will be ready at ${time}.`;
      break;
    case 'order_ready':
      kindLine = de ? 'Ihre Bestellung ist abholbereit.' : 'Your order is ready to collect.';
      break;
    case 'order_rejected': {
      const sentence = pick(REJECT_SENTENCES[rejectionReasonOf(order)]);
      kindLine = sentence;
      break;
    }
    case 'order_cancelled':
      kindLine = de ? 'Sie haben Ihre Bestellung storniert.' : 'You cancelled your order.';
      break;
  }

  const itemRows = order.items.map((i) => {
    const variant = i.selectedVariantOptionName ? ` (${i.selectedVariantOptionName})` : '';
    const addons = i.selectedAddonOptionNames?.length ? ` + ${i.selectedAddonOptionNames.join(', ')}` : '';
    return `${i.quantity} × ${i.productName}${variant}${addons} — ${f.money(i.lineTotalCents)}`;
  });

  const linkLine =
    kind === 'order_received'
      ? `${de ? 'Bestellung ansehen oder stornieren' : 'View or cancel your order'}: ${input.customerOrderUrl}`
      : `${de ? 'Bestellung ansehen' : 'View your order'}: ${input.customerOrderUrl}`;

  const impressum = legalOf(shop).impressum;
  const blocks: Block[] = [
    { type: 'p', text: `${de ? 'Hallo' : 'Hello'} ${order.customerName},` },
    { type: 'p', text: kindLine },
    { type: 'items', rows: itemRows },
    { type: 'p', text: `${de ? 'Summe' : 'Total'}: ${f.money(order.subtotalCents)}` },
  ];
  blocks.push({ type: 'p', text: linkLine });
  if (impressum) {
    blocks.push({
      type: 'p',
      text: `${de ? 'Abholung' : 'Collect from'}: ${impressum.street}, ${impressum.postcode} ${impressum.city}`,
    });
    blocks.push({
      type: 'p',
      text: buildImpressumLines(impressum, lang)
        .map((l) => `${l.label}: ${l.value}`)
        .join('\n'),
    });
  }
  return render(pick(subjects[kind]), blocks);
}
