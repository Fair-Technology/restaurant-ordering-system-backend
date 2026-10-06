import type { Order } from '../../../domain/order/Order';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import { displayPaymentStatus, refundedCents, wasAutoAccepted } from '../../../domain/order/payment';
import { documentsOf } from '../invoices/issueInvoice';
import type { OrderDto } from '../getOrdersByShop/dtos';

/** The restaurant's view of an order. Deliberately omits customerAccessToken and idempotencyKey. */
export function toOrderDto(order: Order, now: Date): OrderDto {
  return {
    id: order.id,
    orderRef: order.orderRef,
    state: order.state,
    displayState: deriveDisplayState(order, now),
    fulfilmentMode: order.fulfilmentMode,
    table: order.table ? { label: order.table.label } : null,
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
    })),
    subtotalCents: order.subtotalCents,
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
