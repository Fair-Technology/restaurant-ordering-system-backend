import { ordersScreenDocId, type OrdersScreenDoc } from '../../../domain/order/ordersScreen';
import { usageContainer } from '../cosmosClient';

// One document per restaurant in the shop_usage container (partition key /id), addressed only by point reads.

export async function findOrdersScreenDoc(shopId: string): Promise<OrdersScreenDoc | null> {
  const id = ordersScreenDocId(shopId);
  try {
    const { resource } = await usageContainer.item(id, id).read<OrdersScreenDoc>();
    return resource ?? null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function upsertOrdersScreenDoc(doc: OrdersScreenDoc): Promise<void> {
  await usageContainer.items.upsert<OrdersScreenDoc>(doc);
}
