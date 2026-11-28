import { HttpRequest } from '@azure/functions';
import {
  SHOP_OPTION_GROUP_NOT_FOUND_ERROR,
  SHOP_OPTION_GROUP_OPTION_AVAILABILITY_ERROR,
  SHOP_OPTION_GROUP_OPTION_NOT_FOUND_ERROR,
} from '../../../domain/optionGroup/ShopOptionGroup';
import {
  findShopOptionGroupById,
  updateShopOptionGroup,
} from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, requireId, toShopOptionGroupDto } from '../optionGroupShared';
import { SetOptionAvailabilityRequestDto, SetOptionAvailabilityResultDto } from './dtos';

/** The one "out of Coke" switch: flips a single option of a library group. */
export async function executeSetOptionAvailability(
  request: SetOptionAvailabilityRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetOptionAvailabilityResultDto>> {
  const invalid =
    requireId(request?.shopId, 'shopId') ??
    requireId(request?.groupId, 'groupId') ??
    requireId(request?.optionId, 'optionId');
  if (invalid) return invalid;
  if (typeof request.isAvailable !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_OPTION_AVAILABILITY_ERROR, errorCode: 'OPTION_AVAILABILITY_INVALID', field: 'isAvailable' };
  }
  const shopId = request.shopId.trim();
  const optionId = request.optionId.trim();
  const isAvailable = request.isAvailable;

  try {
    const auth = await authorizeMenuShop(shopId, httpRequest);
    if (!auth.ok) return auth;

    const existing = await findShopOptionGroupById(request.groupId.trim(), shopId);
    if (!existing || existing.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR };
    }
    const option = existing.options.find((o) => o.id === optionId);
    if (!option) {
      return { ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_OPTION_NOT_FOUND_ERROR };
    }

    const saved = await updateShopOptionGroup({
      ...existing,
      options: existing.options.map((o) => (o.id === optionId ? { ...o, isAvailable } : o)),
      updatedAt: new Date().toISOString(),
    });

    await logAudit({
      shopId,
      ...toAuditActor(auth.access.actor),
      action: isAvailable ? 'optionGroup.option.enable' : 'optionGroup.option.disable',
      entityType: 'optionGroup',
      entityId: saved.id,
      entityName: `${saved.name}: ${option.name}`,
    });

    return { ok: true, data: toShopOptionGroupDto(saved) };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('setOptionAvailability', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update option availability' };
  }
}
