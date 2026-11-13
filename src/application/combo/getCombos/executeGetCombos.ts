import type { HttpRequest } from '@azure/functions';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import type { ApplicationResult } from '../../_shared/types';
import { authorizeCombos } from '../authorizeCombos';
import { toComboDto, type ComboDto } from '../dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

/** The restaurant's combos, by name. Dishes are listed elsewhere. */
export async function executeGetCombos(
  input: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ComboDto[]>> {
  try {
    const auth = await authorizeCombos(input.shopId, httpRequest, { allowPlatformRead: true });
    if (!auth.ok) return auth;
    const products = await findProductsByShopId(auth.shop.id);
    return { ok: true, data: products.filter((p) => p.combo).map(toComboDto).sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (error) {
    logServiceFailure('getCombos', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to get combos' };
  }
}
