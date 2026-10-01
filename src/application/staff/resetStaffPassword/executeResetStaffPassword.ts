import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findStaffAccountById,
  replaceStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { hashPassword } from '../../../infrastructure/auth/passwordHashing';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { toDto, canManage, CANNOT_MANAGE_ERROR, validatePassword } from '../_shared';
import { ResetStaffPasswordRequestDto, ResetStaffPasswordResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeResetStaffPassword(
  request: ResetStaffPasswordRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ResetStaffPasswordResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!request.staffId || typeof request.staffId !== 'string' || request.staffId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'staffId is required and must be a non-empty string' };
  }
  const passwordError = validatePassword(request.password);
  if (passwordError) return { ok: false, code: 'INVALID_INPUT', error: passwordError };

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

    const now = new Date();
    const saved = await replaceStaffAccount({
      ...acc,
      passwordHash: await hashPassword(request.password),
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: now.toISOString(),
    });

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'staff.password_reset',
      entityType: 'staff',
      entityId: saved.id,
      entityName: saved.id,
    });

    return { ok: true, data: toDto(saved, now) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to reset staff password' };
  }
}
