import type { Order } from '../../../domain/order/Order';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import type { OrderDto } from '../getOrdersByShop/dtos';

/** The restaurant's view of an order. Deliberately omits customerAccessToken and idempotencyKey. */
export function toOrderDto(order: Order, now: Date): OrderDto {
  return {
    id: order.id,
    orderRef: order.orderRef,
    state: order.state,
    displayState: deriveDisplayState(order, now),
    fulfilmentMode: order.fulfilmentMode,
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
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
  };
}
