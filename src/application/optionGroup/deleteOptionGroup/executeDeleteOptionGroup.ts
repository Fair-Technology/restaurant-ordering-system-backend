import { HttpRequest } from '@azure/functions';
import { SHOP_OPTION_GROUP_NOT_FOUND_ERROR } from '../../../domain/optionGroup/ShopOptionGroup';
import {
  findShopOptionGroupById,
  updateShopOptionGroup,
} from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import {
  findProductsByShopId,
  updateProduct,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, requireId } from '../optionGroupShared';
import { DeleteOptionGroupRequestDto, DeleteOptionGroupResultDto } from './dtos';

export async function executeDeleteOptionGroup(
  request: DeleteOptionGroupRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteOptionGroupResultDto>> {
  const invalid = requireId(request?.shopId, 'shopId') ?? requireId(request?.groupId, 'groupId');
  if (invalid) return invalid;
  const shopId = request.shopId.trim();

  try {
    const auth = await authorizeMenuShop(shopId, httpRequest);
    if (!auth.ok) return auth;

    const existing = await findShopOptionGroupById(request.groupId.trim(), shopId);
    if (!existing || existing.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR };
    }

    // Soft delete
    const saved = await updateShopOptionGroup({
      ...existing,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    });

    // Cascade: strip the deleted group id from every product that references it, otherwise the product's next
    // save fails validateMenuFields ("Unknown option group"). Best effort on purpose: the group itself is already
    // deleted, so a cleanup failure is logged and must not turn the primary delete into an error.
    try {
      const groupId = saved.id;
      const products = await findProductsByShopId(shopId);
      const referencing = products.filter((p) => p.optionGroupRefs?.includes(groupId));
      const now = new Date().toISOString();
      await Promise.all(
        referencing.map((p) =>
          updateProduct({
            ...p,
            optionGroupRefs: (p.optionGroupRefs ?? []).filter((id) => id !== groupId),
            updatedAt: now,
          }).catch((error: unknown) => logServiceFailure('deleteOptionGroup.cleanupProductRefs', error)),
        ),
      );
    } catch (error: unknown) {
      logServiceFailure('deleteOptionGroup.cleanupProductRefs', error);
    }

    await logAudit({
      shopId,
      ...toAuditActor(auth.access.actor),
      action: 'optionGroup.delete',
      entityType: 'optionGroup',
      entityId: saved.id,
      entityName: saved.name,
    });

    return {
      ok: true,
      data: { id: saved.id, shopId: saved.shopId, name: saved.name, isDeleted: saved.isDeleted, updatedAt: saved.updatedAt },
    };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('deleteOptionGroup', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to delete option group' };
  }
}
