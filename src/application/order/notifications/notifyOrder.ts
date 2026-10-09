import { legalOf } from '../../../domain/legal/legalTexts';
import type { Order } from '../../../domain/order/Order';
import { escalationRecipients } from '../../../domain/order/orderSettings';
import type { LoyaltyVoucherDoc } from '../../../domain/promotion/promotions';
import type { Shop } from '../../../domain/shop/Shop';
import { EmailAttachment, sendEmail } from '../../../infrastructure/email/emailSender';
import { AttachedDocument, buildLoyaltyVoucherEmail, buildOrderEmail, OrderEmailKind } from './emailTemplates';

export function customerOrderUrl(shop: Pick<Shop, 'slug'>, order: Pick<Order, 'id' | 'customerAccessToken'>): string {
  const base = process.env.STOREFRONT_BASE_URL ?? 'http://localhost:5175';
  return `${base}/shops/${shop.slug}/orders/${order.id}?t=${order.customerAccessToken ?? ''}`;
}

export function shopUrl(shop: Pick<Shop, 'slug'>): string {
  return `${process.env.STOREFRONT_BASE_URL ?? 'http://localhost:5175'}/shops/${shop.slug}`;
}

function adminOrdersUrl(shop: Pick<Shop, 'id'>): string {
  return `${process.env.ADMIN_APP_URL ?? 'http://localhost:5173'}/shops/${shop.id}/orders`;
}

/** Emails the diner about their order. Never throws: a mail problem must not undo an order. */
export async function notifyCustomer(
  kind: Exclude<OrderEmailKind, 'order_escalation' | 'payment_release_failed'>,
  order: Order,
  shop: Shop,
  options: { attachments?: EmailAttachment[]; attachedDocument?: AttachedDocument } = {},
): Promise<void> {
  try {
    if (order.customerEmail === '') return; // erased customer
    const content = buildOrderEmail({
      kind,
      order,
      shop,
      customerOrderUrl: customerOrderUrl(shop, order),
      adminOrdersUrl: adminOrdersUrl(shop),
      attachedDocument: options.attachedDocument,
    });
    await sendEmail({
      to: [order.customerEmail],
      ...content,
      replyTo: legalOf(shop).impressum?.email?.trim() || null,
      attachments: options.attachments,
      tag: kind,
    });
  } catch {
    console.error('[email:error]', kind);
  }
}

/** Emails the restaurant that an order has waited three minutes. Never throws. */
export async function notifyRestaurantEscalation(order: Order, shop: Shop): Promise<void> {
  try {
    const to = escalationRecipients(shop);
    if (to.length === 0) return;
    const content = buildOrderEmail({
      kind: 'order_escalation',
      order,
      shop,
      customerOrderUrl: customerOrderUrl(shop, order),
      adminOrdersUrl: adminOrdersUrl(shop),
    });
    await sendEmail({ to, ...content, replyTo: null, tag: 'order_escalation' });
  } catch {
    console.error('[email:error]', 'order_escalation');
  }
}

/** Emails the restaurant that a declined order's payment could not be given back. Never throws. */
export async function notifyRestaurantReleaseFailed(order: Order, shop: Shop): Promise<void> {
  try {
    const to = escalationRecipients(shop);
    if (to.length === 0) return;
    const content = buildOrderEmail({
      kind: 'payment_release_failed',
      order,
      shop,
      customerOrderUrl: customerOrderUrl(shop, order),
      adminOrdersUrl: adminOrdersUrl(shop),
    });
    await sendEmail({ to, ...content, replyTo: null, tag: 'payment_release_failed' });
  } catch {
    console.error('[email:error]', 'payment_release_failed');
  }
}

/** Emails the diner their loyalty voucher. Never throws. */
export async function notifyLoyaltyVoucher(order: Order, shop: Shop, voucher: LoyaltyVoucherDoc, orderCount: number): Promise<void> {
  try {
    if (order.customerEmail === '') return; // erased customer
    const content = buildLoyaltyVoucherEmail({ order, shop, voucher, orderCount, shopUrl: shopUrl(shop) });
    await sendEmail({
      to: [order.customerEmail],
      ...content,
      replyTo: legalOf(shop).impressum?.email?.trim() || null,
      tag: 'loyalty_voucher',
    });
  } catch {
    console.error('[email:error]', 'loyalty_voucher');
  }
}
