import { HttpRequest } from '@azure/functions';
import { getRolePermissions } from '../../../infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { ALL_SHOP_PERMISSIONS } from '../../../domain/shop/Shop';
import { ApplicationResult } from '../../_shared/types';
import { RolePermissionsResultDto } from './dtos';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';

export async function executeGetRolePermissions(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RolePermissionsResultDto>> {
  try {
    const adminId = await requirePlatform(httpRequest, 'read');
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const doc = await getRolePermissions();
    return {
      ok: true,
      data: {
        owner: [...ALL_SHOP_PERMISSIONS],
        manager: doc.manager,
        staff: doc.staff,
        updatedAt: doc.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to get role permissions' };
  }
}
