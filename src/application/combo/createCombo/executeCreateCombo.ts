import { randomUUID } from 'node:crypto';
import type { HttpRequest } from '@azure/functions';
import {
  COMBO_ENABLE_NEEDS_PHOTO_ERROR,
  COMBO_IMAGE_REQUIRED_TO_ENABLE,
  parseComboInput,
} from '../../../domain/product/combo';
import type { Product } from '../../../domain/product/Product';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { createProduct, findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { codedFields } from '../../_shared/errorCodes';
import { COMBO_ERROR_CODES, COMBO_FALLBACK_ERROR_CODE } from '../../../domain/product/combo';
import type { ApplicationResult } from '../../_shared/types';
import { authorizeCombos } from '../authorizeCombos';
import { comboContext } from '../comboContext';
import { toComboDto, type ComboDto } from '../dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

/** Adds a combo: a product record carrying choice groups instead of sizes and extras. */
export async function executeCreateCombo(
  input: { shopId: string; body?: Record<string, unknown>; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ComboDto>> {
  try {
    const auth = await authorizeCombos(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    const now = input.now ?? new Date();
    const [categories, products] = await Promise.all([
      findCategoriesByShopId(auth.shop.id),
      findProductsByShopId(auth.shop.id),
    ]);
    const f = parseComboInput(input.body ?? {}, comboContext(auth.shop, categories, products, null));
    if ('error' in f) return { ok: false, code: 'INVALID_INPUT', error: f.error, ...codedFields(f.error, COMBO_ERROR_CODES, COMBO_FALLBACK_ERROR_CODE) };
    // A new combo has no photo yet (it is added through the product photo upload afterwards), so it cannot be
    // created ON: explicit isAvailable:true is refused; leaving it out creates the combo OFF (it used to default to on).
    if (f.isAvailable && input.body?.isAvailable === true) {
      return { ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_ENABLE_NEEDS_PHOTO_ERROR, errorCode: COMBO_IMAGE_REQUIRED_TO_ENABLE };
    }
    const at = now.toISOString();
    const product: Product = {
      id: randomUUID(),
      shopId: auth.shop.id,
      name: f.name,
      description: f.description,
      nameTranslations: f.nameTranslations ?? {},
      descriptionTranslations: f.descriptionTranslations ?? {},
      price: f.price,
      categoryIds: f.categoryIds,
      images: [],
      variantGroups: [],
      addonGroups: [],
      allergenIds: [],
      additiveIds: [],
      dietaryTagIds: [],
      spiceLevel: null,
      prepMinutes: null,
      unavailableModes: [],
      taxClassId: null,
      schedule: null,
      isAvailable: false,
      isDeleted: false,
      combo: f.combo,
      createdAt: at,
      updatedAt: at,
    };
    const created = await createProduct(product);
    await logAudit({
      shopId: auth.shop.id,
      ...auth.audit,
      action: 'combo.create',
      entityType: 'product',
      entityId: created.id,
      entityName: created.name,
      changes: [{ field: 'name', from: null, to: created.name }],
    });
    return { ok: true, data: toComboDto(created) };
  } catch (error) {
    logServiceFailure('createCombo', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create combo' };
  }
}
