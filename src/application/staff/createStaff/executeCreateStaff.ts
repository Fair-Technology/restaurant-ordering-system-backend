import { HttpRequest } from '@azure/functions';
import { randomUUID } from 'crypto';
import { StaffAccount } from '../../../domain/staff/StaffAccount';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  listStaffAccounts,
  createStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { hashPassword } from '../../../infrastructure/auth/passwordHashing';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { getPlanLimitForShop } from '../../_shared/planLimits';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { logAudit } from '../../_shared/auditHelpers';
import { toDto, canManage, CANNOT_MANAGE_ERROR, validateUsername, validatePassword, validateRole } from '../_shared';
import { CreateStaffRequestDto, CreateStaffResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeCreateStaff(
  request: CreateStaffRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateStaffResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  const usernameError = validateUsername(
    typeof request.username === 'string' ? request.username.trim().toLowerCase() : request.username,
  );
  if (usernameError) return { ok: false, code: 'INVALID_INPUT', error: usernameError };

  const passwordError = validatePassword(request.password);
  if (passwordError) return { ok: false, code: 'INVALID_INPUT', error: passwordError };

  const roleError = validateRole(request.role);
  if (roleError) return { ok: false, code: 'INVALID_INPUT', error: roleError };

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_staff');
    if (!access.ok) return access;

    if (!canManage(access.actor, request.role)) {
      return { ok: false, code: 'FORBIDDEN', error: CANNOT_MANAGE_ERROR };
    }

    const existing = await listStaffAccounts(shop.id);
    const activeCount = existing.filter((a) => a.isActive).length;
    const limit = await getPlanLimitForShop(shop.id, PLAN_LIMIT_KEYS.STAFF_ACCOUNTS);
    if (limit !== null && limit !== -1 && activeCount >= limit) {
      return { ok: false, code: 'LIMIT_REACHED', error: `Your plan allows ${limit} staff logins.` };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const account: StaffAccount = {
      id: randomUUID(),
      shopId: shop.id,
      username: request.username.trim().toLowerCase(),
      displayName: request.displayName?.trim() || null,
      role: request.role,
      passwordHash: await hashPassword(request.password),
      isActive: true,
      isDeleted: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdBy: access.actor.actorId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let created: StaffAccount;
    try {
      created = await createStaffAccount(account);
    } catch (err: any) {
      if (err?.code === 409) {
        return { ok: false, code: 'CONFLICT', error: 'That username is already taken in this restaurant' };
      }
      throw err;
    }

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'staff.create',
      entityType: 'staff',
      entityId: created.id,
      entityName: created.id,
    });

    return { ok: true, data: toDto(created, now) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create staff login' };
  }
}
