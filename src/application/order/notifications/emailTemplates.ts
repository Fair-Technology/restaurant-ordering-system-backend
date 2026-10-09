import { buildImpressumLines } from '../../../domain/legal/impressum';
import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import { chargedCents, type Order, type RejectReason } from '../../../domain/order/Order';
import { displayPaymentStatus, isCaptured } from '../../../domain/order/payment';
import type { MenuLanguage } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';

export type OrderEmailKind =
  | 'order_received'
  | 'order_accepted'
  | 'order_ready'
  | 'order_out_for_delivery'
  | 'order_rejected'
  | 'order_cancelled'
  | 'order_escalation'
  | 'order_refunded'
  | 'payment_release_failed';

/** A PDF attached to the email (the invoice or a correction); the text points to it. */
export interface AttachedDocument {
  title: string;
  number: string;
}

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
    de: 'Die Zahlung konnte bei der Annahme nicht abgeschlossen werden.',
    en: 'The payment could not be completed when the restaurant accepted.',
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

export function render(subject: string, blocks: Block[]): OrderEmailContent {
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
        ? `Bestellung ${order.orderRef} (${f.money(chargedCents(order))}) wartet seit 3 Minuten. Ohne Annahme wird sie um ${until} automatisch abgelehnt.`
        : `Order ${order.orderRef} (${f.money(chargedCents(order))}) has been waiting 3 minutes. It will be declined automatically at ${until} unless you accept it.`,
    },
    ...(order.scheduledFor
      ? [{ type: 'p' as const, text: `${de ? 'Vorbestellt für' : 'Scheduled for'}: ${f.when(order.scheduledFor)}` }]
      : []),
    ...(order.table ? [{ type: 'p' as const, text: `${de ? 'Tisch' : 'Table'}: ${order.table.label}` }] : []),
    { type: 'p', text: `${de ? 'Zu den Bestellungen' : 'Open orders'}: ${adminOrdersUrl}` },
  ]);
}

/** The restaurant is told (in its own language) that giving the diner's money back failed. */
function buildReleaseFailedEmail(order: Order, shop: Shop, adminOrdersUrl: string): OrderEmailContent {
  const lang = menuLanguagesOf(shop)[0];
  const de = lang === 'de';
  const money = formatters(lang, order.currency, shop.timezone).money(chargedCents(order));
  const ref = order.orderRef;
  const message = order.releaseFailure?.message ?? '';
  return render(
    de ? `Zahlung für Bestellung ${ref} konnte nicht freigegeben werden` : `Payment for order ${ref} could not be released`,
    [
      {
        type: 'p',
        text: de
          ? `Die Reservierung bzw. Erstattung von ${money} für Bestellung ${ref} ist fehlgeschlagen. Stripe meldet: ${message}. Wir versuchen es alle 15 Minuten erneut. Bitte prüfen Sie Ihr Stripe-Konto.`
          : `Releasing or refunding ${money} for order ${ref} failed. Stripe says: ${message}. We retry every 15 minutes. Please check your Stripe account.`,
      },
      { type: 'p', text: `${de ? 'Zu den Bestellungen' : 'Open orders'}: ${adminOrdersUrl}` },
    ],
  );
}

function formatters(lang: MenuLanguage, currency: string, timeZone: string) {
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' });
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' });
  const dayMonth = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'long' });
  return {
    money: (cents: number): string => money.format(cents / 100),
    time: (iso: string): string => time.format(new Date(iso)),
    when: (iso: string): string => {
      const d = new Date(iso);
      return `${weekday.format(d)}, ${dayMonth.format(d)}, ${time.format(d)}`;
    },
  };
}

export function buildOrderEmail(input: {
  kind: OrderEmailKind;
  order: Order;
  shop: Shop;
  customerOrderUrl: string;
  adminOrdersUrl: string;
  attachedDocument?: AttachedDocument;
}): OrderEmailContent {
  const { kind, order, shop } = input;
  if (kind === 'order_escalation') return buildEscalationEmail(order, shop, input.adminOrdersUrl);
  if (kind === 'payment_release_failed') return buildReleaseFailedEmail(order, shop, input.adminOrdersUrl);

  const lang = order.language ?? menuLanguagesOf(shop)[0];
  const de = lang === 'de';
  const pick = (b: Bilingual): string => b[lang];
  const f = formatters(lang, order.currency, shop.timezone);
  const ref = order.orderRef;
  const time = order.readyAt ? f.time(order.readyAt) : '';
  const when = order.scheduledFor ? f.when(order.scheduledFor) : null;
  const name = shop.name;
  const dineIn = order.fulfilmentMode === 'dine_in';
  const delivery = order.fulfilmentMode === 'delivery';

  const subjects: Record<Exclude<OrderEmailKind, 'order_escalation' | 'payment_release_failed'>, Bilingual> = {
    order_received: when
      ? { de: `${name}: Bestellung ${ref} für ${when} eingegangen`, en: `${name}: order ${ref} for ${when} received` }
      : { de: `${name}: Bestellung ${ref} eingegangen`, en: `${name}: order ${ref} received` },
    order_accepted: delivery
      ? {
          de: `${name}: Bestellung ${ref} angenommen – Lieferung gegen ${time}`,
          en: `${name}: order ${ref} accepted – delivery around ${time}`,
        }
      : {
          de: dineIn
            ? `${name}: Bestellung ${ref} angenommen – fertig um ${time}`
            : `${name}: Bestellung ${ref} angenommen – abholbereit um ${time}`,
          en: `${name}: order ${ref} accepted – ready at ${time}`,
        },
    order_out_for_delivery: { de: `${name}: Bestellung ${ref} ist unterwegs`, en: `${name}: order ${ref} is on its way` },
    order_ready: dineIn
      ? { de: `${name}: Bestellung ${ref} ist fertig`, en: `${name}: order ${ref} is ready` }
      : { de: `${name}: Bestellung ${ref} ist abholbereit`, en: `${name}: order ${ref} is ready to collect` },
    order_rejected: { de: `${name}: Bestellung ${ref} abgelehnt`, en: `${name}: order ${ref} declined` },
    order_cancelled: { de: `${name}: Bestellung ${ref} storniert`, en: `${name}: order ${ref} cancelled` },
    order_refunded: { de: `${name}: Erstattung für Bestellung ${ref}`, en: `${name}: refund for order ${ref}` },
  };

  let kindLine: string;
  switch (kind) {
    case 'order_received':
      kindLine = when
        ? de
          ? `Ihre Bestellung für ${when} ist eingegangen. ${name} bestätigt sie kurz vorher.`
          : `Your order for ${when} has been received. ${name} will confirm it shortly before.`
        : de
          ? `Ihre Bestellung ist eingegangen. ${name} bestätigt sie in Kürze.`
          : `Your order has been received. ${name} will confirm it shortly.`;
      break;
    case 'order_accepted':
      kindLine = delivery
        ? de
          ? `Ihre Bestellung wurde angenommen und wird gegen ${time} geliefert.`
          : `Your order has been accepted and will be delivered around ${time}.`
        : de
          ? `Ihre Bestellung wurde angenommen und ist um ${time} ${dineIn ? 'fertig' : 'abholbereit'}.`
          : `Your order has been accepted and will be ready at ${time}.`;
      break;
    case 'order_out_for_delivery':
      kindLine = de ? 'Ihre Bestellung ist unterwegs zu Ihnen.' : 'Your order is on its way.';
      break;
    case 'order_ready':
      kindLine = dineIn
        ? de
          ? 'Ihre Bestellung ist fertig.'
          : 'Your order is ready.'
        : de
          ? 'Ihre Bestellung ist abholbereit.'
          : 'Your order is ready to collect.';
      break;
    case 'order_rejected': {
      const sentence = pick(REJECT_SENTENCES[rejectionReasonOf(order)]);
      kindLine = sentence;
      break;
    }
    case 'order_cancelled':
      kindLine = de ? 'Sie haben Ihre Bestellung storniert.' : 'You cancelled your order.';
      break;
    case 'order_refunded': {
      const last = f.money((order.refunds ?? []).at(-1)?.amountCents ?? 0);
      kindLine = de
        ? `Wir haben Ihnen ${last} erstattet. Die Gutschrift kann je nach Bank einige Tage dauern.`
        : `We have refunded ${last} to you. It can take a few days to appear, depending on your bank.`;
      break;
    }
  }

  const itemRows = order.items.map((i) => {
    const variant = i.selectedVariantOptionName ? ` (${i.selectedVariantOptionName})` : '';
    const addons = i.selectedAddonOptionNames?.length ? ` + ${i.selectedAddonOptionNames.join(', ')}` : '';
    return `${i.quantity} × ${i.productName}${variant}${addons} — ${f.money(i.lineTotalCents)}`;
  });
  if (order.discount) {
    itemRows.push(`${order.discount.kind === 'voucher' ? (de ? 'Gutschein' : 'Voucher') : de ? 'Rabatt' : 'Discount'} ${order.discount.code} — ${f.money(-order.discount.cents)}`);
  }
  for (const c of order.charges ?? []) {
    itemRows.push(`${de ? 'Liefergebühr' : 'Delivery fee'} — ${f.money(c.grossCents)}`);
  }

  const linkLine =
    kind === 'order_received'
      ? `${de ? 'Bestellung ansehen oder stornieren' : 'View or cancel your order'}: ${input.customerOrderUrl}`
      : `${de ? 'Bestellung ansehen' : 'View your order'}: ${input.customerOrderUrl}`;

  const impressum = legalOf(shop).impressum;
  const total = f.money(chargedCents(order));
  const status = displayPaymentStatus(order);
  let paymentLine: string | null = null;
  if (kind === 'order_received' || kind === 'order_accepted' || kind === 'order_ready' || kind === 'order_out_for_delivery') {
    if (status === 'authorized') {
      paymentLine = de
        ? `Betrag reserviert: ${total} – abgebucht wird erst, wenn ${name} annimmt.`
        : `Amount reserved: ${total} – you are only charged when ${name} accepts.`;
    } else if (isCaptured(order)) {
      paymentLine = de ? `Bezahlt (online): ${total}` : `Paid (online): ${total}`;
    }
  }
  let moneyLine: string | null = null;
  if (kind === 'order_rejected' || kind === 'order_cancelled') {
    if (status === 'canceled' || status === 'authorized') {
      moneyLine = de
        ? 'Es wurde nichts abgebucht. Die Reservierung auf Ihrer Karte wird aufgehoben; je nach Bank kann sie noch einige Tage angezeigt werden.'
        : 'You have not been charged. The reservation on your card is being released; your bank may show it for a few more days.';
    } else if (status === 'refunded' || status === 'paid') {
      moneyLine = de
        ? `Wir erstatten Ihnen den vollen Betrag von ${total}. Die Gutschrift kann je nach Bank einige Tage dauern.`
        : `We are refunding the full amount of ${total}. It can take a few days to appear, depending on your bank.`;
    }
  }
  const doc = input.attachedDocument;

  const blocks: Block[] = [
    { type: 'p', text: `${de ? 'Hallo' : 'Hello'} ${order.customerName},` },
    { type: 'p', text: kindLine },
  ];
  if (order.table) blocks.push({ type: 'p', text: `${de ? 'Tisch' : 'Table'}: ${order.table.label}` });
  if (moneyLine) blocks.push({ type: 'p', text: moneyLine });
  if (doc) {
    blocks.push({
      type: 'p',
      text: de
        ? `Ihre ${doc.title} ${doc.number} finden Sie im Anhang.`
        : `Your ${doc.title.toLowerCase()} ${doc.number} is attached.`,
    });
  }
  blocks.push(
    { type: 'items', rows: itemRows },
    { type: 'p', text: `${de ? 'Summe' : 'Total'}: ${total}` },
  );
  if (paymentLine) blocks.push({ type: 'p', text: paymentLine });
  blocks.push({ type: 'p', text: linkLine });
  if (impressum) {
    if (delivery && order.deliveryAddress) {
      const a = order.deliveryAddress;
      blocks.push({ type: 'p', text: `${de ? 'Lieferung an' : 'Deliver to'}: ${a.street}, ${a.postcode} ${a.city}` });
    } else if (!dineIn) {
      blocks.push({
        type: 'p',
        text: `${de ? 'Abholung' : 'Collect from'}: ${impressum.street}, ${impressum.postcode} ${impressum.city}`,
      });
    }
    blocks.push({
      type: 'p',
      text: buildImpressumLines(impressum, lang)
        .map((l) => `${l.label}: ${l.value}`)
        .join('\n'),
    });
  }
  return render(pick(subjects[kind]), blocks);
}
