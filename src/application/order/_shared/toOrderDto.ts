import { chargedCents, deliveryFeeCentsOf, type Order } from '../../../domain/order/Order';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import { displayPaymentStatus, refundedCents, wasAutoAccepted } from '../../../domain/order/payment';
import { documentsOf } from '../invoices/issueInvoice';
import type { OrderDto } from '../getOrdersByShop/dtos';

/**
 * The platform superadmin's view of an order. The platform is a processor, so it
 * gets only what its screen needs: the diner's name stays, while the delivery and
 * billing address, email, phone and notes are blanked.
 */
export function toSuperadminOrderDto(order: Order, now: Date): OrderDto {
  const { customerNotes: _notes, ...rest } = toOrderDto(order, now);
  return { ...rest, deliveryAddress: null, customerAddress: null, customerEmail: '', customerPhone: '' };
}

/** The restaurant's view of an order. Deliberately omits customerAccessToken and idempotencyKey. */
export function toOrderDto(order: Order, now: Date): OrderDto {
  return {
    id: order.id,
    orderRef: order.orderRef,
    state: order.state,
    displayState: deriveDisplayState(order, now),
    fulfilmentMode: order.fulfilmentMode,
    table: order.table ? { label: order.table.label } : null,
    scheduledFor: order.scheduledFor ?? null,
    paymentStatus: displayPaymentStatus(order),
    readyAt: order.readyAt ?? null,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      selectedVariantOptionId: item.selectedVariantOptionId,
      selectedVariantOptionName: item.selectedVariantOptionName,
      selectedAddonOptionIds: item.selectedAddonOptionIds,
      selectedAddonOptionNames: item.selectedAddonOptionNames,
      lineTotalCents: item.lineTotalCents,
      discountCents: item.discountCents ?? 0,
      combo: item.combo ?? null,
    })),
    subtotalCents: order.subtotalCents,
    totalCents: chargedCents(order),
    deliveryFeeCents: deliveryFeeCentsOf(order),
    deliveryAddress: order.deliveryAddress ?? null,
    discount: order.discount ? { kind: order.discount.kind, code: order.discount.code, cents: order.discount.cents } : null,
    loyaltyVoucherSent: !!order.loyaltyVoucher,
    currency: order.currency,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerNotes: order.customerNotes,
    history: order.history,
    createdAt: order.createdAt,
    autoRejectAt: order.autoRejectAt ?? null,
    acceptedAt: order.acceptedAt ?? null,
    prepMinutes: order.prepMinutes ?? null,
    taxBreakdown: order.taxBreakdown ?? [],
    rejectionNote: order.rejectionNote ?? null,
    customerAddress: order.customerAddress ?? null,
    refundedCents: refundedCents(order),
    refunds: (order.refunds ?? []).map((r) => ({
      amountCents: r.amountCents,
      reason: r.reason,
      at: r.at,
      lines: (r.lines ?? []).map((l) => ({ lineIndex: l.lineIndex, quantity: l.quantity })),
    })),
    releaseFailure: order.releaseFailure ? { at: order.releaseFailure.at, message: order.releaseFailure.message } : null,
    documents: documentsOf(order),
    autoAccepted: wasAutoAccepted(order),
  };
}
