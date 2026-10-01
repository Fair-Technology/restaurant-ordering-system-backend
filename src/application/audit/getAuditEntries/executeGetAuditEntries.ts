import { HttpRequest } from '@azure/functions';
import { findAuditEntriesByShop } from '../../../infrastructure/cosmos/audit/CosmosAuditRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findStaffAccountById } from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
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

    const access = await authorizeShopAction(httpRequest, shop, 'view_audit', { allowSuperadmin: true });
    if (!access.ok) return access;

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

    const staffIds = [...new Set(entries.filter((e) => e.actorType === 'staff').map((e) => e.actorId))];
    const staffEntries = await Promise.all(
      staffIds.map(async (id): Promise<[string, string | null]> => {
        const acc = await findStaffAccountById(request.shopId.trim(), id);
        return [id, acc && !acc.isDeleted ? (acc.displayName ?? acc.username) : null];
      }),
    );
    const staff = new Map(staffEntries);

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
