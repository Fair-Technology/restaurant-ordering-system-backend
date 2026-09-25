import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findStaffAccountById,
  replaceStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { canManage, CANNOT_MANAGE_ERROR } from '../_shared';
import { DeleteStaffRequestDto, DeleteStaffResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeDeleteStaff(
  request: DeleteStaffRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteStaffResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!request.staffId || typeof request.staffId !== 'string' || request.staffId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'staffId is required and must be a non-empty string' };
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

    const now = new Date().toISOString();
    const saved = await replaceStaffAccount({
      ...acc,
      username: `deleted.${acc.id}`,
      displayName: null,
      passwordHash: '',
      isActive: false,
      isDeleted: true,
      updatedAt: now,
    });

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'staff.delete',
      entityType: 'staff',
      entityId: saved.id,
      entityName: saved.id,
    });

    return { ok: true, data: { id: saved.id, deleted: true } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to delete staff login' };
  }
}
