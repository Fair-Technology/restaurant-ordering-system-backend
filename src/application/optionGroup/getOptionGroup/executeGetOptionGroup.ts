import { HttpRequest } from '@azure/functions';
import { SHOP_OPTION_GROUP_NOT_FOUND_ERROR } from '../../../domain/optionGroup/ShopOptionGroup';
import { findShopOptionGroupById } from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, requireId, toShopOptionGroupDto } from '../optionGroupShared';
import { GetOptionGroupRequestDto, GetOptionGroupResultDto } from './dtos';

export async function executeGetOptionGroup(
  request: GetOptionGroupRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetOptionGroupResultDto>> {
  const invalid = requireId(request?.shopId, 'shopId') ?? requireId(request?.groupId, 'groupId');
  if (invalid) return invalid;
  const shopId = request.shopId.trim();

  try {
    const auth = await authorizeMenuShop(shopId, httpRequest);
    if (!auth.ok) return auth;

    const group = await findShopOptionGroupById(request.groupId.trim(), shopId);
    if (!group || group.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR };
    }
    return { ok: true, data: toShopOptionGroupDto(group) };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getOptionGroup', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve option group' };
  }
}
