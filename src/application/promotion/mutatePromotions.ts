import {
  PROMOTIONS_CONFLICT_ERROR,
  promotionsDocId,
  type ShopPromotionsDoc,
} from '../../domain/promotion/promotions';
import {
  createPromotions,
  findPromotionsWithEtag,
  replacePromotionsIfMatch,
} from '../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import type { ApplicationError } from '../_shared/types';

const MAX_WRITE_ATTEMPTS = 3;

/**
 * Reads the restaurant's promotions document, applies `apply`, and writes it back only if nobody changed it
 * in between; on a clash it re-reads and re-applies, up to three times.
 */
export async function mutatePromotions(
  shopId: string,
  apply: (doc: ShopPromotionsDoc) => ShopPromotionsDoc | { error: ApplicationError },
  now: Date,
): Promise<{ ok: true; before: ShopPromotionsDoc; after: ShopPromotionsDoc } | ApplicationError> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const found = await findPromotionsWithEtag(shopId);
    const before: ShopPromotionsDoc = found?.doc ?? {
      id: promotionsDocId(shopId),
      kind: 'shop_promotions',
      shopId,
      codes: [],
      loyalty: null,
      updatedAt: now.toISOString(),
    };
    const next = apply(before);
    if ('error' in next) return next.error;
    const after = { ...next, updatedAt: now.toISOString() };
    const written = found ? await replacePromotionsIfMatch(after, found.etag) : await createPromotions(after);
    if (written === 'ok') return { ok: true, before, after };
  }
  return { ok: false, code: 'CONFLICT', error: PROMOTIONS_CONFLICT_ERROR };
}
