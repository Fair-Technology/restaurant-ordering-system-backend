import { DEFAULT_ROLE_PERMISSIONS, RolePermissionsDoc } from '../../../domain/system/RolePermissions';
import { systemConfigContainer } from '../cosmosClient';

const ROLE_PERMISSIONS_ID = 'role_permissions';

export async function getRolePermissions(): Promise<RolePermissionsDoc> {
  try {
    const { resource } = await systemConfigContainer
      .item(ROLE_PERMISSIONS_ID, ROLE_PERMISSIONS_ID)
      .read<RolePermissionsDoc>();
    if (resource) return resource;
    return { id: ROLE_PERMISSIONS_ID, ...DEFAULT_ROLE_PERMISSIONS, updatedAt: null, updatedBy: null };
  } catch (error: any) {
    if (error.code === 404) {
      return { id: ROLE_PERMISSIONS_ID, ...DEFAULT_ROLE_PERMISSIONS, updatedAt: null, updatedBy: null };
    }
    throw error;
  }
}

export async function saveRolePermissions(doc: RolePermissionsDoc): Promise<RolePermissionsDoc> {
  await systemConfigContainer.items.upsert<RolePermissionsDoc>(doc);
  return doc;
}
