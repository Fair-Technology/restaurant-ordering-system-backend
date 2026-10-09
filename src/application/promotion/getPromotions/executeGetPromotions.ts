import type { HttpRequest } from '@azure/functions';
import type { ApplicationResult } from '../../_shared/types';
import { authorizePromotions } from '../authorizePromotions';
import { loadPromotionsDto } from '../loadPromotionsDto';
import type { PromotionsDto } from '../dtos';

/** The restaurant's discount codes with their use counts, and its loyalty rule. */
export async function executeGetPromotions(
  input: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PromotionsDto>> {
  try {
    const auth = await authorizePromotions(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    return { ok: true, data: await loadPromotionsDto(auth.shop.id) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load discounts' };
  }
}
