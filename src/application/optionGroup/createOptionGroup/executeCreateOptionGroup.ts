import { HttpRequest } from '@azure/functions';
import {
  isShopOptionGroupKind,
  SHOP_OPTION_GROUP_KIND_ERROR,
  ShopOptionGroup,
  validateShopOptionGroupFields,
} from '../../../domain/optionGroup/ShopOptionGroup';
import { createShopOptionGroup } from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { codedFields } from '../../_shared/errorCodes';
import { OPTION_GROUP_ERROR_CODES, OPTION_GROUP_FALLBACK_ERROR_CODE } from '../../../domain/optionGroup/ShopOptionGroup';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, knownReferenceIds, requireId, toShopOptionGroupDto } from '../optionGroupShared';
import { CreateOptionGroupRequestDto, CreateOptionGroupResultDto } from './dtos';

export async function executeCreateOptionGroup(
  request: CreateOptionGroupRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateOptionGroupResultDto>> {
  const invalidShop = requireId(request?.shopId, 'shopId');
  if (invalidShop) return invalidShop;
  if (!isShopOptionGroupKind(request.kind)) {
    return { ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_KIND_ERROR, errorCode: 'OPTION_GROUP_KIND_INVALID', field: 'kind' };
  }
  const kind = request.kind;
  const shopId = request.shopId.trim();

  try {
    const auth = await authorizeMenuShop(shopId, httpRequest);
    if (!auth.ok) return auth;

    const refs = await getReferenceLists(auth.shop.countryCode ?? '');
    const fields = validateShopOptionGroupFields(request, kind, knownReferenceIds(refs), [], () => crypto.randomUUID());
    if ('error' in fields) {
      return { ok: false, code: 'INVALID_INPUT', error: fields.error, ...codedFields(fields.error, OPTION_GROUP_ERROR_CODES, OPTION_GROUP_FALLBACK_ERROR_CODE) };
    }

    const now = new Date().toISOString();
    const group: ShopOptionGroup = {
      id: crypto.randomUUID(),
      shopId,
      kind,
      ...fields,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await createShopOptionGroup(group);

    await logAudit({
      shopId,
      ...toAuditActor(auth.access.actor),
      action: 'optionGroup.create',
      entityType: 'optionGroup',
      entityId: saved.id,
      entityName: saved.name,
    });

    return { ok: true, data: toShopOptionGroupDto(saved) };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('createOptionGroup', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create option group' };
  }
}
