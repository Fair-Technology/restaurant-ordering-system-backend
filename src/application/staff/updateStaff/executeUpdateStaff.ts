import { HttpRequest } from '@azure/functions';
import { StaffAccount } from '../../../domain/staff/StaffAccount';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findStaffAccountById,
  listStaffAccounts,
  replaceStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { getPlanLimitForShop } from '../../_shared/planLimits';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { toDto, canManage, CANNOT_MANAGE_ERROR, validateRole } from '../_shared';
import { UpdateStaffRequestDto, UpdateStaffResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeUpdateStaff(
  request: UpdateStaffRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateStaffResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!request.staffId || typeof request.staffId !== 'string' || request.staffId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'staffId is required and must be a non-empty string' };
  }
  if (request.role !== undefined) {
    const roleError = validateRole(request.role);
    if (roleError) return { ok: false, code: 'INVALID_INPUT', error: roleError };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_staff');
    if (!access.ok) return access;

    const acc = await findStaffAccountById(shop.id, request.staffId.trim());
    if (!acc || acc.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Staff login not found' };
    }

    if (!canManage(access.actor, acc.role)) {
      return { ok: false, code: 'FORBIDDEN', error: CANNOT_MANAGE_ERROR };
    }
    if (request.role && !canManage(access.actor, request.role)) {
      return { ok: false, code: 'FORBIDDEN', error: CANNOT_MANAGE_ERROR };
    }

    const isReactivating = request.isActive === true && !acc.isActive;
    if (isReactivating) {
      const existing = await listStaffAccounts(shop.id);
      const activeCount = existing.filter((a) => a.isActive).length;
      const limit = await getPlanLimitForShop(shop.id, PLAN_LIMIT_KEYS.STAFF_ACCOUNTS);
      if (limit !== null && limit !== -1 && activeCount >= limit) {
        return { ok: false, code: 'LIMIT_REACHED', error: `Your plan allows ${limit} staff logins.` };
      }
    }

    const now = new Date();
    const next: StaffAccount = {
      ...acc,
      role: request.role ?? acc.role,
      displayName: request.displayName !== undefined ? (request.displayName?.trim() || null) : acc.displayName,
      isActive: request.isActive ?? acc.isActive,
      updatedAt: now.toISOString(),
    };

    const saved = await replaceStaffAccount(next);

    // displayName is the owner's own choice of label, not part of the account's
    // identity, so it is deliberately left out of the audited diff.
    const changes = diffFields(
      acc as unknown as Record<string, unknown>,
      next as unknown as Record<string, unknown>,
      ['role', 'isActive'],
      [],
    );
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'staff.update',
      entityType: 'staff',
      entityId: saved.id,
      entityName: saved.id,
      changes,
    });

    return { ok: true, data: toDto(saved, now) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update staff login' };
  }
}
