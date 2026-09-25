import { findOrderByStripePaymentIntentId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import {
  FulfilmentMode,
  OrderState,
  PaymentStatus,
  StoredOrderState,
} from '../../../domain/order/Order';
import { ApplicationResult } from '../../_shared/types';

export interface GetOrderByPaymentIntentResultDto {
  orderId: string;
  orderRef: string;
  state: StoredOrderState;
  displayState: OrderState;
  fulfilmentMode: FulfilmentMode;
  paymentStatus: PaymentStatus;
  readyAt: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    selectedVariantOptionId?: string;
    selectedVariantOptionName?: string;
    selectedAddonOptionIds?: string[];
    selectedAddonOptionNames?: string[];
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  currency: string;
  customerName: string;
  createdAt: string;
}

export async function getOrderByPaymentIntent(
  paymentIntentId: string,
): Promise<ApplicationResult<GetOrderByPaymentIntentResultDto>> {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
    return { ok: false, code: 'NOT_FOUND', error: 'Order not found' };
  }

  try {
    const order = await findOrderByStripePaymentIntentId(paymentIntentId);
    if (!order) {
      return { ok: false, code: 'NOT_FOUND', error: 'Order not found' };
    }
    return {
      ok: true,
      data: {
        orderId: order.id,
        orderRef: order.orderRef,
        state: order.state,
        displayState: deriveDisplayState(order, new Date()),
        fulfilmentMode: order.fulfilmentMode,
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
        createdAt: order.createdAt,
      },
    };
  } catch (error) {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve order' };
  }
}
