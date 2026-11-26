import { HttpRequest } from '@azure/functions';
import { findAuditEntriesByShop, findDistinctAuditActors } from '../../../infrastructure/cosmos/audit/CosmosAuditRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findStaffAccountById } from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { AuditActorType } from '../../../domain/audit/AuditEntry';
import { AUDIT_AREAS, AuditArea, actionsForArea } from '../../../domain/audit/auditAreas';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { resolveActorLabels, resolveStaffTargetNames } from '../../_shared/buildAuditEntry';
import { GetAuditEntriesRequestDto, GetAuditEntriesResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

const ACTOR_TYPES: string[] = ['owner', 'staff', 'superadmin', 'system'];

export async function executeGetAuditEntries(
  request: GetAuditEntriesRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetAuditEntriesResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  let area: AuditArea | undefined;
  if (request.area !== undefined && request.area !== '') {
    if (!(AUDIT_AREAS as readonly string[]).includes(request.area)) {
      return { ok: false, code: 'INVALID_INPUT', error: `area must be one of ${AUDIT_AREAS.join(', ')} (got '${request.area}')` };
    }
    area = request.area as AuditArea;
  }

  let actorType: AuditActorType | undefined;
  let actorId: string | undefined;
  if (request.actor !== undefined && request.actor !== '') {
    const sep = request.actor.indexOf(':');
    const type = sep === -1 ? request.actor : request.actor.slice(0, sep);
    if (!ACTOR_TYPES.includes(type)) {
      return { ok: false, code: 'INVALID_INPUT', error: `actor type must be one of ${ACTOR_TYPES.join(', ')} (got '${type}')` };
    }
    actorType = type as AuditActorType;
    if (sep !== -1) {
      actorId = request.actor.slice(sep + 1);
      if (actorId === '') {
        return { ok: false, code: 'INVALID_INPUT', error: `actor id after ':' must not be empty (got '${request.actor}')` };
      }
    }
  }

  const page = Math.max(1, request.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, request.pageSize ?? 20));

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'view_audit', { allowSuperadmin: true, allowPlatformRead: true });
    if (!access.ok) return access;

    const { entries, total } = await findAuditEntriesByShop(
      request.shopId.trim(),
      page,
      pageSize,
      { actions: area ? actionsForArea(area) : undefined, actorType, actorId },
    );
    const distinctActors = await findDistinctAuditActors(request.shopId.trim());

    const labelled = [...entries, ...distinctActors];
    const ownerIds = [...new Set(labelled.filter((e) => e.actorType === 'owner').map((e) => e.actorId))];
    const ownerEntries = await Promise.all(
      ownerIds.map(async (id): Promise<[string, string | null]> => {
        const user = await findUserById(id);
        return [id, user?.name ?? user?.email ?? null];
      }),
    );
    const owners = new Map(ownerEntries);

    // One lookup per staff id serves both staff actors and staff targets.
    const staffIds = [
      ...new Set([
        ...labelled.filter((e) => e.actorType === 'staff').map((e) => e.actorId),
        ...entries.filter((e) => e.entityType === 'staff').map((e) => e.entityId),
      ]),
    ];
    const staffEntries = await Promise.all(
      staffIds.map(async (id): Promise<[string, string | null]> => {
        const acc = await findStaffAccountById(request.shopId.trim(), id);
        return [id, acc && !acc.isDeleted ? (acc.displayName ?? acc.username) : null];
      }),
    );
    const staff = new Map(staffEntries);

    const actorLabels = resolveActorLabels(entries, { owners, staff });
    const actors = Object.entries(resolveActorLabels(distinctActors, { owners, staff }))
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // Staff use cases persist the staff id as entityName; show the name instead (read-time only).
    resolveStaffTargetNames(entries, staff);

    return {
      ok: true,
      data: { entries, total, page, pageSize, actorLabels, actors },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getAuditEntries', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve audit entries' };
  }
}
