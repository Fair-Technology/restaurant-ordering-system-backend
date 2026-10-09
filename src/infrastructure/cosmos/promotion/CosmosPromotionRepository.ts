import type { LoyaltyVoucherDoc, ShopPromotionsDoc } from '../../../domain/promotion/promotions';
import { promotionsDocId, voucherDocId } from '../../../domain/promotion/promotions';
import { usageContainer } from '../cosmosClient';

// Both document kinds live in the shop_usage container (partition key /id), addressed only by point reads.

export async function findPromotions(shopId: string): Promise<ShopPromotionsDoc | null> {
  const found = await findPromotionsWithEtag(shopId);
  return found ? found.doc : null;
}

export async function findPromotionsWithEtag(shopId: string): Promise<{ doc: ShopPromotionsDoc; etag: string } | null> {
  const id = promotionsDocId(shopId);
  try {
    const { resource, etag } = await usageContainer.item(id, id).read<ShopPromotionsDoc>();
    return resource && etag ? { doc: resource, etag } : null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/** Creates the first promotions document; 'conflict' means someone created it first. */
export async function createPromotions(doc: ShopPromotionsDoc): Promise<'ok' | 'conflict'> {
  try {
    await usageContainer.items.create<ShopPromotionsDoc>(doc);
    return 'ok';
  } catch (error: any) {
    if (error.code === 409) return 'conflict';
    throw error;
  }
}

/** Replaces the document only if nobody changed it since it was read; 'conflict' means someone did. */
export async function replacePromotionsIfMatch(doc: ShopPromotionsDoc, etag: string): Promise<'ok' | 'conflict'> {
  try {
    await usageContainer.item(doc.id, doc.id).replace<ShopPromotionsDoc>(doc, {
      accessCondition: { type: 'IfMatch', condition: etag },
    });
    return 'ok';
  } catch (error: any) {
    if (error.code === 412) return 'conflict';
    throw error;
  }
}

export async function findVoucher(shopId: string, code: string): Promise<LoyaltyVoucherDoc | null> {
  const id = voucherDocId(shopId, code);
  try {
    const { resource } = await usageContainer.item(id, id).read<LoyaltyVoucherDoc>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function createVoucher(doc: LoyaltyVoucherDoc): Promise<void> {
  await usageContainer.items.create<LoyaltyVoucherDoc>(doc);
}
