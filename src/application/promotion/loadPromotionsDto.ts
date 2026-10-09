import { countsAsUse, DEFAULT_LOYALTY } from '../../domain/promotion/promotions';
import { listDiscountUseRows } from '../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findPromotions } from '../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import type { PromotionsDto } from './dtos';

/** The owner's view: codes (newest first) with how often each is used, and the loyalty rule. */
export async function loadPromotionsDto(shopId: string): Promise<PromotionsDto> {
  const [doc, rows] = await Promise.all([findPromotions(shopId), listDiscountUseRows(shopId)]);
  const uses = new Map<string, number>();
  for (const r of rows) if (countsAsUse(r)) uses.set(r.code, (uses.get(r.code) ?? 0) + 1);
  return {
    codes: [...(doc?.codes ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c, uses: uses.get(c.code) ?? 0 })),
    loyalty: doc?.loyalty ?? { ...DEFAULT_LOYALTY, since: null },
  };
}
