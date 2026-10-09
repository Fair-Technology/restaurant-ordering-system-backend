import { vi } from 'vitest';
import type { Shop } from '../../src/domain/shop/Shop';
import { slotPlacesDocId, type SlotPlace, type SlotPlacesDoc } from '../../src/domain/order/slotCapacity';
import * as repo from '../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository';
import { SCHEDULED_SHOP } from './orders';

export const capped = (slotCapacity: number): Shop => ({ ...SCHEDULED_SHOP, orderSettings: { scheduledOrders: true, slotCapacity } });
export const dayDoc = (day: string, places: SlotPlace[]): SlotPlacesDoc => ({
  id: slotPlacesDocId('shop-1', day), kind: 'slot_places', shopId: 'shop-1', day, places, updatedAt: '2026-10-01T00:00:00.000Z',
});

/** An in-memory shop_usage for day records, with ETags; the test file must vi.mock the repository. */
export function installSlotStore(initial: SlotPlacesDoc[] = []) {
  const docs = new Map(initial.map((d) => [d.id, d] as const));
  let n = 1;
  vi.mocked(repo.findSlotPlacesWithEtag).mockImplementation(async (shopId, day) => {
    const d = docs.get(slotPlacesDocId(shopId, day));
    return d ? { doc: structuredClone(d), etag: `etag-${n}` } : null;
  });
  vi.mocked(repo.createSlotPlaces).mockImplementation(async (doc) => {
    if (docs.has(doc.id)) return 'conflict';
    docs.set(doc.id, doc);
    n += 1;
    return 'ok';
  });
  vi.mocked(repo.replaceSlotPlacesIfMatch).mockImplementation(async (doc, etag) => {
    if (etag !== `etag-${n}`) return 'conflict';
    docs.set(doc.id, doc);
    n += 1;
    return 'ok';
  });
  return { doc: (day: string): SlotPlacesDoc | null => docs.get(slotPlacesDocId('shop-1', day)) ?? null };
}
