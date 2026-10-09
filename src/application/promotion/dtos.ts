import type { DiscountCode, LoyaltyRule } from '../../domain/promotion/promotions';

export type DiscountCodeDto = DiscountCode & { uses: number };

export interface PromotionsDto {
  codes: DiscountCodeDto[]; // newest first
  loyalty: LoyaltyRule; // DEFAULT_LOYALTY + since null when never saved
}
