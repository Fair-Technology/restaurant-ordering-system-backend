import { slotPlacesDocId, type SlotPlacesDoc } from '../../../domain/order/slotCapacity';
import { usageContainer } from '../cosmosClient';

// One document per restaurant day in the shop_usage container (partition key /id), addressed only by point reads.

export async function findSlotPlacesWithEtag(shopId: string, day: string): Promise<{ doc: SlotPlacesDoc; etag: string } | null> {
  const id = slotPlacesDocId(shopId, day);
  try {
    const { resource, etag } = await usageContainer.item(id, id).read<SlotPlacesDoc>();
    return resource && etag ? { doc: resource, etag } : null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/** Creates the first record of a day; 'conflict' means someone created it first. */
export async function createSlotPlaces(doc: SlotPlacesDoc): Promise<'ok' | 'conflict'> {
  try {
    await usageContainer.items.create<SlotPlacesDoc>(doc);
    return 'ok';
  } catch (error: any) {
    if (error.code === 409) return 'conflict';
    throw error;
  }
}

/** Replaces the record only if nobody changed it since it was read; 'conflict' means someone did. */
export async function replaceSlotPlacesIfMatch(doc: SlotPlacesDoc, etag: string): Promise<'ok' | 'conflict'> {
  try {
    await usageContainer.item(doc.id, doc.id).replace<SlotPlacesDoc>(doc, {
      accessCondition: { type: 'IfMatch', condition: etag },
    });
    return 'ok';
  } catch (error: any) {
    if (error.code === 412) return 'conflict';
    throw error;
  }
}
