import { PushSubscription, pushSubscriptionId } from '../../../domain/push/PushSubscription';
import { pushSubscriptionsContainer } from '../cosmosClient';

export async function upsertSubscription(sub: PushSubscription): Promise<PushSubscription> {
  const doc: PushSubscription = { ...sub, isDeleted: false };
  await pushSubscriptionsContainer.items.upsert<PushSubscription>(doc);
  return doc;
}

export async function findSubscriptionsByShopId(shopId: string): Promise<PushSubscription[]> {
  const { resources } = await pushSubscriptionsContainer.items
    .query<PushSubscription>({
      query: 'SELECT * FROM c WHERE c.shopId = @shopId AND c.isDeleted = false',
      parameters: [{ name: '@shopId', value: shopId }],
    })
    .fetchAll();
  return resources;
}

export async function softDeleteSubscription(shopId: string, endpoint: string): Promise<boolean> {
  const id = pushSubscriptionId(shopId, endpoint);
  const { resource } = await pushSubscriptionsContainer.item(id, id).read<PushSubscription>();
  if (!resource || resource.isDeleted) return false;
  await pushSubscriptionsContainer.items.upsert<PushSubscription>({ ...resource, isDeleted: true });
  return true;
}
