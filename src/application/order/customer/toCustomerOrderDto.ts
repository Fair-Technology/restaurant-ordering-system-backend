import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import { Order, REJECT_REASON_CODES, RejectReason } from '../../../domain/order/Order';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import { displayPaymentStatus, refundedCents } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import { documentsOf } from '../invoices/issueInvoice';
import type { CustomerOrderDto } from './dtos';

const KNOWN_REASONS: readonly string[] = [...REJECT_REASON_CODES, 'no_response', 'payment_failed'];

/** The diner's view of an order: never the staff note, the token, or other people's data. */
export function toCustomerOrderDto(order: Order, shop: Shop, now: Date): CustomerOrderDto {
  const rejection = [...order.history].reverse().find((h) => h.to === 'REJECTED');
  const rejectionReason: RejectReason | null = rejection
    ? rejection.reason && KNOWN_REASONS.includes(rejection.reason)
      ? (rejection.reason as RejectReason)
      : 'other'
    : null;
  return {
    orderId: order.id,
    orderRef: order.orderRef,
    shopSlug: shop.slug,
    shopName: shop.name,
    sellerPhone: legalOf(shop).impressum?.phone?.trim() || null,
    timezone: shop.timezone,
    language: order.language ?? menuLanguagesOf(shop)[0],
    state: order.state,
    displayState: deriveDisplayState(order, now),
    fulfilmentMode: order.fulfilmentMode,
    table: order.table ? { label: order.table.label } : null,
    paymentStatus: displayPaymentStatus(order),
    refundedCents: refundedCents(order),
    documents: documentsOf(order),
    readyAt: order.readyAt ?? null,
    items: order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      lineTotalCents: i.lineTotalCents,
      selectedVariantOptionName: i.selectedVariantOptionName ?? null,
      selectedAddonOptionNames: i.selectedAddonOptionNames ?? [],
    })),
    subtotalCents: order.subtotalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    canCancel: order.state === 'PLACED',
    rejectionReason,
  };
}
