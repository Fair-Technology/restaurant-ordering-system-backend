import type { HttpRequest } from '@azure/functions';
import { COMBO_NOT_FOUND_ERROR, parseComboInput } from '../../../domain/product/combo';
import type { Product } from '../../../domain/product/Product';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import {
  findProductById,
  findProductsByShopId,
  updateProduct,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import type { ApplicationResult } from '../../_shared/types';
import { authorizeCombos } from '../authorizeCombos';
import { comboContext } from '../comboContext';
import { toComboDto, type ComboDto } from '../dtos';

/** Replaces a combo's fields as a whole. Group ids sent back are kept, so baskets holding the combo still work. */
export async function executeUpdateCombo(
  input: { shopId: string; comboId: string; body?: Record<string, unknown>; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ComboDto>> {
  try {
    const auth = await authorizeCombos(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    const now = input.now ?? new Date();
    const before = await findProductById(input.comboId, auth.shop.id);
    if (!before || before.isDeleted || !before.combo) {
      return { ok: false, code: 'NOT_FOUND', error: COMBO_NOT_FOUND_ERROR };
    }
    const [categories, products] = await Promise.all([
      findCategoriesByShopId(auth.shop.id),
      findProductsByShopId(auth.shop.id),
    ]);
    const f = parseComboInput(input.body ?? {}, comboContext(auth.shop, categories, products, before.combo));
    if ('error' in f) return { ok: false, code: 'INVALID_INPUT', error: f.error };
    const after: Product = {
      ...before,
      name: f.name,
      description: f.description,
      price: f.price,
      categoryIds: f.categoryIds,
      isAvailable: f.isAvailable,
      combo: f.combo,
      updatedAt: now.toISOString(),
    };
    const saved = await updateProduct(after);
    await logAudit({
      shopId: auth.shop.id,
      ...auth.audit,
      action: 'combo.update',
      entityType: 'product',
      entityId: saved.id,
      entityName: saved.name,
      changes: diffFields(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        ['name', 'price', 'isAvailable', 'description'],
        ['categoryIds', 'combo'],
      ),
    });
    return { ok: true, data: toComboDto(saved) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update combo' };
  }
}
