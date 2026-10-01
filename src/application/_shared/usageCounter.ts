import { ShopUsage } from '../../domain/usage/ShopUsage';

/**
 * Computes the next usage document for a shop that just had an order accepted.
 * Resets the count when the period key has rolled over since the last write.
 */
export function nextUsage(
  current: ShopUsage | null,
  shopId: string,
  periodKey: string,
  now: Date,
): ShopUsage {
  const at = now.toISOString();
  if (!current) {
    return {
      id: shopId,
      shopId,
      periodKey,
      acceptedOrderCount: 1,
      lastReconciled: null,
      createdAt: at,
      updatedAt: at,
    };
  }
  const base = current.periodKey === periodKey ? current.acceptedOrderCount : 0;
  return { ...current, periodKey, acceptedOrderCount: base + 1, updatedAt: at };
}
