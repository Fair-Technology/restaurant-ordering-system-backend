import { HttpRequest } from '@azure/functions';
import { findAuditEntriesByShop } from '../../../infrastructure/cosmos/audit/CosmosAuditRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { checkIsOwner } from '../../_shared/permissions';
import { resolveActorLabels } from '../../_shared/buildAuditEntry';
import { GetAuditEntriesRequestDto, GetAuditEntriesResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetAuditEntries(
  request: GetAuditEntriesRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetAuditEntriesResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  const page = Math.max(1, request.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, request.pageSize ?? 20));

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    // Accept either a valid superadmin JWT or a regular owner JWT
    const superAdminId = await verifySuperAdminToken(httpRequest);

    if (!superAdminId) {
      let userId: string;
      try {
        userId = await getUserIdFromAuth(httpRequest);
      } catch {
        return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
      }

      const ownerError = checkIsOwner(shop, userId);
      if (ownerError) return ownerError;
    }

    const { entries, total } = await findAuditEntriesByShop(
      request.shopId.trim(),
      page,
      pageSize,
    );

    const ownerIds = [...new Set(entries.filter((e) => e.actorType === 'owner').map((e) => e.actorId))];
    const ownerEntries = await Promise.all(
      ownerIds.map(async (id): Promise<[string, string | null]> => {
        const user = await findUserById(id);
        return [id, user?.name ?? user?.email ?? null];
      }),
    );
    const owners = new Map(ownerEntries);
    const staff = new Map<string, string | null>(); // filled in step 25

    const actorLabels = resolveActorLabels(entries, { owners, staff });

    return {
      ok: true,
      data: { entries, total, page, pageSize, actorLabels },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve audit entries' };
  }
}
