import { missedOrdersDocId, type MissedOrdersDoc } from '../../../domain/order/missedOrders';
import { usageContainer } from '../cosmosClient';

// One document per shop in the shop_usage container (partition key /id), addressed only by point reads and patches.
// The count is changed with Cosmos's atomic increment, so two writers never lose each other's update.

/** Adds one to the shop's missed-order count and returns the new count. The first miss creates the document. */
export async function incrementMissedStreak(shopId: string, now: Date): Promise<number> {
  const id = missedOrdersDocId(shopId);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { resource } = await usageContainer.item(id, id).patch<MissedOrdersDoc>([
        { op: 'incr', path: '/streak', value: 1 },
        { op: 'set', path: '/updatedAt', value: now.toISOString() },
      ]);
      return resource!.streak;
    } catch (e: any) {
      if (e?.code !== 404) throw e;
    }
    try {
      await usageContainer.items.create<MissedOrdersDoc>({
        id,
        kind: 'missed_orders',
        shopId,
        streak: 1,
        updatedAt: now.toISOString(),
      });
      return 1;
    } catch (e: any) {
      if (e?.code !== 409) throw e; // 409: another writer created it first, so count on top of theirs
    }
  }
  throw new Error('missed-orders streak could not be recorded');
}

/** Starts the count again. A shop with no record yet has nothing to reset. */
export async function resetMissedStreak(shopId: string, now: Date): Promise<void> {
  const id = missedOrdersDocId(shopId);
  try {
    await usageContainer.item(id, id).patch([
      { op: 'set', path: '/streak', value: 0 },
      { op: 'set', path: '/updatedAt', value: now.toISOString() },
    ]);
  } catch (e: any) {
    if (e?.code !== 404) throw e;
  }
}
