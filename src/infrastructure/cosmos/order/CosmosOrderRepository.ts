import { Order, StoredOrderState } from '../../../domain/order/Order';
import { orderContainer } from '../cosmosClient';
import type { OrderForRejectionStats } from '../../../domain/usage/rejectionStats';

export async function createOrder(order: Order): Promise<Order> {
  try {
    const { resource } = await orderContainer.items.create<Order>(order);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function findOrderById(orderId: string): Promise<Order | null> {
  try {
    const { resource } = await orderContainer
      .item(orderId, orderId)
      .read<Order>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findOrderByStripePaymentIntentId(
  paymentIntentId: string,
): Promise<Order | null> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.payment.stripePaymentIntentId = @paymentIntentId',
      parameters: [{ name: '@paymentIntentId', value: paymentIntentId }],
    };
    const { resources } = await orderContainer.items
      .query<Order>(querySpec)
      .fetchAll();
    return resources[0] ?? null;
  } catch (error) {
    throw error;
  }
}

export async function countOrdersInUsagePeriod(shopId: string, periodKey: string): Promise<number> {
  const querySpec = {
    query: 'SELECT VALUE COUNT(1) FROM c WHERE c.shopId = @shopId AND c.usagePeriodKey = @periodKey',
    parameters: [
      { name: '@shopId', value: shopId },
      { name: '@periodKey', value: periodKey },
    ],
  };
  const { resources } = await orderContainer.items.query<number>(querySpec).fetchAll();
  return resources[0] ?? 0;
}

export async function findOrdersByShopId(shopId: string): Promise<Order[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.shopId = @shopId ORDER BY c.createdAt DESC',
    parameters: [{ name: '@shopId', value: shopId }],
  };
  const { resources } = await orderContainer.items
    .query<Order>(querySpec)
    .fetchAll();
  return resources;
}

export async function countOrdersByShopId(shopId: string): Promise<number> {
  const querySpec = {
    query: 'SELECT VALUE COUNT(1) FROM c WHERE c.shopId = @shopId',
    parameters: [{ name: '@shopId', value: shopId }],
  };
  const { resources } = await orderContainer.items.query<number>(querySpec).fetchAll();
  return resources[0] ?? 0;
}

export async function findOrdersByShopIdPaginated(
  shopId: string,
  page: number,
  pageSize: number,
): Promise<Order[]> {
  const offset = (page - 1) * pageSize;
  const querySpec = {
    query: `SELECT * FROM c WHERE c.shopId = @shopId ORDER BY c.createdAt DESC OFFSET ${offset} LIMIT ${pageSize}`,
    parameters: [{ name: '@shopId', value: shopId }],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

export async function findOrdersByShopIdAndCustomerEmail(shopId: string, emailLower: string): Promise<Order[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.shopId = @shopId AND LOWER(c.customerEmail) = @email',
    parameters: [
      { name: '@shopId', value: shopId },
      { name: '@email', value: emailLower },
    ],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

export async function replaceOrder(order: Order): Promise<Order> {
  const { resource } = await orderContainer.item(order.id, order.id).replace<Order>(order);
  return resource!;
}

export async function findOrderWithEtag(orderId: string): Promise<{ order: Order; etag: string } | null> {
  try {
    const { resource, etag } = await orderContainer.item(orderId, orderId).read<Order>();
    return resource && etag ? { order: resource, etag } : null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/** Replaces the order only if nobody changed it since it was read; 'conflict' means someone did. */
export async function replaceOrderIfMatch(order: Order, etag: string): Promise<'ok' | 'conflict'> {
  try {
    await orderContainer.item(order.id, order.id).replace<Order>(order, {
      accessCondition: { type: 'IfMatch', condition: etag },
    });
    return 'ok';
  } catch (error: any) {
    if (error.code === 412) return 'conflict';
    throw error;
  }
}

export async function findOrdersByShopIdAndStates(shopId: string, states: StoredOrderState[]): Promise<Order[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.shopId = @shopId AND ARRAY_CONTAINS(@states, c.state) ORDER BY c.createdAt ASC',
    parameters: [
      { name: '@shopId', value: shopId },
      { name: '@states', value: states },
    ],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

export async function findPlacedOrdersCreatedBefore(cutoffIso: string): Promise<Order[]> {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.state = 'PLACED' AND c.createdAt <= @cutoff",
    parameters: [{ name: '@cutoff', value: cutoffIso }],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

export async function findOrdersInState(state: StoredOrderState): Promise<Order[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.state = @state',
    parameters: [{ name: '@state', value: state }],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

/** Declined or cancelled card orders whose reservation (or money) has not been given back yet. */
export async function findOrdersAwaitingRelease(): Promise<Order[]> {
  const querySpec = {
    query:
      "SELECT * FROM c WHERE c.payment.method = 'card' AND ARRAY_CONTAINS(['REJECTED', 'CANCELLED'], c.state) AND ARRAY_CONTAINS(['authorized', 'paid'], c.payment.status)",
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

/** Accepted card orders from the given time on that have no invoice number yet. */
export async function findOrdersMissingInvoice(sinceIso: string): Promise<Order[]> {
  const querySpec = {
    query:
      "SELECT * FROM c WHERE c.payment.method = 'card' AND ARRAY_CONTAINS(['ACCEPTED', 'READY', 'COMPLETED'], c.state) AND c.acceptedAt >= @since AND NOT IS_DEFINED(c.invoiceNumber)",
    parameters: [{ name: '@since', value: sinceIso }],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

/** Invoiced card orders changed since the given time that have at least one refund (the timer checks each has its correction invoice). */
export async function findInvoicedOrdersWithRefunds(sinceIso: string): Promise<Order[]> {
  const querySpec = {
    query:
      "SELECT * FROM c WHERE c.payment.method = 'card' AND IS_DEFINED(c.invoiceNumber) AND ARRAY_LENGTH(c.refunds) > 0 AND c.updatedAt >= @since",
    parameters: [{ name: '@since', value: sinceIso }],
  };
  const { resources } = await orderContainer.items.query<Order>(querySpec).fetchAll();
  return resources;
}

/** Only what the decline statistics need: no customer fields (history holds actor ids, not names). */
export async function findOrdersForRejectionStats(shopId: string, sinceIso: string): Promise<OrderForRejectionStats[]> {
  const querySpec = {
    query: 'SELECT c.createdAt, c.acceptedAt, c.history FROM c WHERE c.shopId = @shopId AND c.createdAt >= @since',
    parameters: [
      { name: '@shopId', value: shopId },
      { name: '@since', value: sinceIso },
    ],
  };
  const { resources } = await orderContainer.items.query<OrderForRejectionStats>(querySpec).fetchAll();
  return resources ?? [];
}
