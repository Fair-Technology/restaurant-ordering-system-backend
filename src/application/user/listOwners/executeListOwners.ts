import { HttpRequest } from '@azure/functions';
import { findUsers } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findOwnedShopIds } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getSystemConfig } from '../../../infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ListOwnersRequestDto, ListOwnersResultDto } from './dtos';

/** Platform staff (read level): restaurant owners with their shop count against their effective limit. */
export async function executeListOwners(
  request: ListOwnersRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ListOwnersResultDto>> {
  const actor = await requirePlatform(httpRequest, 'read');
  if (!actor) return { ok: false, code: 'FORBIDDEN', error: 'Platform access required' };

  const page = Math.max(1, request.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, request.pageSize ?? 20));
  const search = request.search?.trim() || undefined;

  try {
    const { users, total } = await findUsers(search, page, pageSize);
    const config = await getSystemConfig();

    const owners = await Promise.all(
      users.map(async (user) => {
        // Same helper the create-shop limit check uses, so the two can never disagree.
        const shopIds = await findOwnedShopIds(user.id);
        return {
          userId: user.id,
          ...(user.email !== undefined && { email: user.email }),
          ...(user.name !== undefined && { name: user.name }),
          maxShops: user.maxShops ?? null,
          effectiveLimit: user.maxShops != null ? user.maxShops : config.maxShopsDefault,
          shopCount: shopIds.length,
        };
      }),
    );

    return { ok: true, data: { owners, total, page, pageSize } };
  } catch (error) {
    logServiceFailure('listOwners', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve owners' };
  }
}
