import { HttpRequest } from '@azure/functions';
import {
  SHOP_OPTION_GROUP_NOT_FOUND_ERROR,
  ShopOptionGroup,
  validateShopOptionGroupFields,
} from '../../../domain/optionGroup/ShopOptionGroup';
import {
  findShopOptionGroupById,
  updateShopOptionGroup,
} from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, knownReferenceIds, requireId, toShopOptionGroupDto } from '../optionGroupShared';
import { UpdateOptionGroupRequestDto, UpdateOptionGroupResultDto } from './dtos';

export async function executeUpdateOptionGroup(
  request: UpdateOptionGroupRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateOptionGroupResultDto>> {
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

    const refs = await getReferenceLists(auth.shop.countryCode ?? '');
    const fields = validateShopOptionGroupFields(
      request,
      existing.kind,
      knownReferenceIds(refs),
      existing.options,
      () => crypto.randomUUID(),
    );
    if ('error' in fields) return { ok: false, code: 'INVALID_INPUT', error: fields.error };

    const updated: ShopOptionGroup = {
      ...existing,
      ...fields,
      kind: existing.kind,
      updatedAt: new Date().toISOString(),
    };
    const saved = await updateShopOptionGroup(updated);

    await logAudit({
      shopId,
      ...toAuditActor(auth.access.actor),
      action: 'optionGroup.update',
      entityType: 'optionGroup',
      entityId: saved.id,
      entityName: saved.name,
    });

    return { ok: true, data: toShopOptionGroupDto(saved) };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateOptionGroup', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update option group' };
  }
}
