import { PlanLimitKey } from './planLimitKeys';
import { loadEntitlements } from './entitlements';

/**
 * Looks up a shop's limit for the given key, counting the plan in force and any per-restaurant override.
 * Returns null when nothing sets the key. Returns -1 when the key is unlimited.
 */
export async function getPlanLimitForShop(shopId: string, key: PlanLimitKey): Promise<number | null> {
  const e = await loadEntitlements(shopId, new Date());
  return e.limits[key] ?? null;
}
