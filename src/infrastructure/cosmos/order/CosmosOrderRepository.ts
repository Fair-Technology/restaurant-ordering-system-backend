import { Order } from '../../../domain/order/Order';
import { orderContainer } from '../cosmosClient';

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
