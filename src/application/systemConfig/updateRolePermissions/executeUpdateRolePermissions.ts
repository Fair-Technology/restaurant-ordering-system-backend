import { HttpRequest } from '@azure/functions';
import {
  getRolePermissions,
  saveRolePermissions,
} from '../../../infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { ALL_SHOP_PERMISSIONS, ShopPermission } from '../../../domain/shop/Shop';
import { RolePermissionsDoc } from '../../../domain/system/RolePermissions';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { UpdateRolePermissionsRequestDto, RolePermissionsResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

function validatePermissionList(value: unknown, field: string): ShopPermission[] | string {
  if (!Array.isArray(value)) {
    return `${field} must be an array`;
  }
  for (const p of value) {
    if (typeof p !== 'string' || !(ALL_SHOP_PERMISSIONS as readonly string[]).includes(p)) {
      return `Unknown permission: ${p}. Valid: ${ALL_SHOP_PERMISSIONS.join(', ')}`;
    }
  }
  return [...new Set(value as ShopPermission[])];
}

export async function executeUpdateRolePermissions(
  request: UpdateRolePermissionsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RolePermissionsResultDto>> {
  const manager = validatePermissionList(request.manager, 'manager');
  if (typeof manager === 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: manager };
  }
  const staff = validatePermissionList(request.staff, 'staff');
  if (typeof staff === 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: staff };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const old = await getRolePermissions();
    const now = new Date().toISOString();
    const next: RolePermissionsDoc = {
      id: 'role_permissions',
      manager,
      staff,
      updatedAt: now,
      updatedBy: adminId,
    };

    const saved = await saveRolePermissions(next);

    const changes = diffFields(
      old as unknown as Record<string, unknown>,
      next as unknown as Record<string, unknown>,
      [],
      ['manager', 'staff'],
    );
    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: adminId,
      action: 'role_permissions.update',
      entityType: 'role_permissions',
      entityId: 'role_permissions',
      entityName: 'Role permissions',
      changes,
    });

    return {
      ok: true,
      data: {
        owner: [...ALL_SHOP_PERMISSIONS],
        manager: saved.manager,
        staff: saved.staff,
        updatedAt: saved.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateRolePermissions', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update role permissions' };
  }
}
