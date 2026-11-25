import type { HttpRequest } from '@azure/functions';
import {
  COMBO_ENABLE_NEEDS_PHOTO_ERROR,
  COMBO_IMAGE_REQUIRED_TO_ENABLE,
  COMBO_LEAVES_ON_WITHOUT_PHOTO_ERROR,
  COMBO_NOT_FOUND_ERROR,
  parseComboInput,
} from '../../../domain/product/combo';
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
import { logServiceFailure } from '../../_shared/logServiceFailure';

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
    // Left out = keep the stored switch (the parser's default of "on" is for nothing now that on needs a photo).
    const isAvailable = input.body?.isAvailable === undefined ? before.isAvailable : f.isAvailable;
    // On with no photo is refused (SPECS §8): turning on in this request -> enable message, an already-on
    // photo-less combo being edited -> leaves-on message. Same code; never switched off silently.
    if (isAvailable && (before.images?.length ?? 0) === 0) {
      const turningOn = input.body?.isAvailable === true;
      return {
        ok: false,
        code: COMBO_IMAGE_REQUIRED_TO_ENABLE,
        error: turningOn ? COMBO_ENABLE_NEEDS_PHOTO_ERROR : COMBO_LEAVES_ON_WITHOUT_PHOTO_ERROR,
      };
    }
    const after: Product = {
      ...before,
      name: f.name,
      description: f.description,
      // Left out = keep, as a dish update does.
      ...(f.nameTranslations && { nameTranslations: f.nameTranslations }),
      ...(f.descriptionTranslations && { descriptionTranslations: f.descriptionTranslations }),
      price: f.price,
      categoryIds: f.categoryIds,
      isAvailable,
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
        ['categoryIds', 'combo', 'nameTranslations', 'descriptionTranslations'],
      ),
    });
    return { ok: true, data: toComboDto(saved) };
  } catch (error) {
    logServiceFailure('updateCombo', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update combo' };
  }
}
