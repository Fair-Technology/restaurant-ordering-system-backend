import { HttpRequest } from '@azure/functions';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId, updateProduct } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';

export interface ApplyCategoryTaxClassRequestDto {
  shopId: string;
  categoryId: string;
}

export interface ApplyCategoryTaxClassResultDto {
  taxClassId: string;
  updatedCount: number; // dishes whose class changed; those already on it are left alone
}

/**
 * Sets every dish in the category to the category's tax class — the bulk fix for a section whose dishes
 * were taxed wrongly. Combos are skipped: they are taxed per dish inside.
 */
export async function executeApplyCategoryTaxClass(
  request: ApplyCategoryTaxClassRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ApplyCategoryTaxClassResultDto>> {
  const shopId = request.shopId?.trim();
  const categoryId = request.categoryId?.trim();
  if (!shopId || !categoryId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId and categoryId are required' };
  }

  try {
    const [category, shop] = await Promise.all([findCategoryById(categoryId, shopId), findShopById(shopId)]);
    if (!category || category.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Category not found' };
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

    const taxClassId = category.taxClassId;
    if (!taxClassId) return { ok: false, code: 'INVALID_INPUT', error: 'This category has no tax class' };

    const products = await findProductsByShopId(shopId);
    const toChange = products.filter(
      (p) => !p.isDeleted && !p.combo && p.categoryIds.includes(categoryId) && p.taxClassId !== taxClassId,
    );
    const now = new Date().toISOString();
    for (const p of toChange) {
      await updateProduct({ ...p, taxClassId, updatedAt: now });
      await logAudit({
        shopId,
        ...toAuditActor(access.actor),
        action: 'product.update',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        changes: [{ field: 'taxClassId', from: p.taxClassId ?? null, to: taxClassId }],
      });
    }

    return { ok: true, data: { taxClassId, updatedCount: toChange.length } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to apply the tax class' };
  }
}
