import { HttpRequest } from '@azure/functions';
import {
  findProductsByShopId,
  updateProduct as updateProductInRepo,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';

export type CategoryOrderKind = 'dish' | 'combo';

export async function executeSetCategoryOrder(
  request: { shopId: string; categoryId: string; productIds: unknown },
  httpRequest: HttpRequest,
  opts: { kind: CategoryOrderKind; auditAction: string },
): Promise<ApplicationResult<{ categoryId: string; products: Array<{ id: string; name: string }> }>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!request.categoryId || typeof request.categoryId !== 'string' || request.categoryId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'categoryId is required and must be a non-empty string' };
  }
  const ids = request.productIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'productIds must be an array of non-empty strings' };
  }
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicates.length > 0) {
    return { ok: false, code: 'INVALID_INPUT', error: `productIds contains duplicates: ${duplicates.join(', ')}` };
  }

  try {
    const shopId = request.shopId.trim();
    const categoryId = request.categoryId.trim();

    const shop = await findShopById(shopId);
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

    const category = await findCategoryById(categoryId, shopId);
    if (!category || category.isDeleted || category.shopId !== shopId) {
      return { ok: false, code: 'NOT_FOUND', error: 'Category not found' };
    }

    // Live (non-deleted) products of this shop of one kind only: dishes and combos are ordered separately,
    // so the other kind is neither accepted nor required.
    const matchesKind = opts.kind === 'dish' ? (p: { combo?: unknown }) => !p.combo : (p: { combo?: unknown }) => !!p.combo;
    const shopProducts = await findProductsByShopId(shopId);
    const inCategory = shopProducts.filter(
      (p) => !p.isDeleted && matchesKind(p) && (p.categoryIds ?? []).includes(categoryId),
    );
    const byId = new Map(inCategory.map((p) => [p.id, p]));

    const bad = ids.filter((id) => !byId.has(id));
    if (bad.length > 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `Not a ${opts.kind} of this category in this shop: ${bad.join(', ')}`,
      };
    }
    const requested = new Set(ids);
    const missing = inCategory.filter((p) => !requested.has(p.id)).map((p) => p.id);
    if (missing.length > 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `productIds must list every ${opts.kind} in the category; missing: ${missing.join(', ')}`,
      };
    }

    const toWrite = ids
      .map((id, index) => ({ product: byId.get(id)!, index }))
      .filter(({ product, index }) => product.categoryOrder?.[categoryId] !== index);

    if (toWrite.length > 0) {
      const now = new Date().toISOString();
      // Not transactional: two admins reordering concurrently is last-write-wins per product (acceptable), and a
      // failure partway through can leave a mixed order — acceptable for v1, no rollback.
      await Promise.all(
        toWrite.map(({ product, index }) =>
          updateProductInRepo({
            ...product,
            categoryOrder: { ...(product.categoryOrder ?? {}), [categoryId]: index },
            updatedAt: now,
          }),
        ),
      );
      await logAudit({
        shopId,
        ...toAuditActor(access.actor),
        action: opts.auditAction,
        entityType: 'category',
        entityId: categoryId,
        entityName: category.name,
        changes: toWrite.map(({ product, index }) => ({
          field: `categoryOrder.${product.id}`,
          from: product.categoryOrder?.[categoryId] ?? null,
          to: index,
        })),
      });
    }

    return {
      ok: true,
      data: { categoryId, products: ids.map((id) => ({ id, name: byId.get(id)!.name })) },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure(opts.kind === 'dish' ? 'setCategoryDishOrder' : 'setCategoryComboOrder', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: `Failed to save ${opts.kind} order` };
  }
}
