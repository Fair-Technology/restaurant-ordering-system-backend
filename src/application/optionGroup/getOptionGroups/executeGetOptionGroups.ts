import { HttpRequest } from '@azure/functions';
import { findShopOptionGroupsByShopId } from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { authorizeMenuShop, requireId, toShopOptionGroupDto } from '../optionGroupShared';
import { GetOptionGroupsRequestDto, GetOptionGroupsResultDto } from './dtos';

export async function executeGetOptionGroups(
  request: GetOptionGroupsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetOptionGroupsResultDto>> {
  const invalidShop = requireId(request?.shopId, 'shopId');
  if (invalidShop) return invalidShop;
  const shopId = request.shopId.trim();

  try {
    const auth = await authorizeMenuShop(shopId, httpRequest);
    if (!auth.ok) return auth;

    const groups = await findShopOptionGroupsByShopId(shopId);
    return {
      ok: true,
      data: groups
        .filter((g) => !g.isDeleted)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toShopOptionGroupDto),
    };
  } catch (error: any) {
    if (error?.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getOptionGroups', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve option groups' };
  }
}
