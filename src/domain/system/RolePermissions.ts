import { ALL_SHOP_PERMISSIONS, ShopPermission, ShopRoleKey } from '../shop/Shop';

export interface RolePermissionsDoc {
  id: 'role_permissions';
  manager: ShopPermission[];
  staff: ShopPermission[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_ROLE_PERMISSIONS: Pick<RolePermissionsDoc, 'manager' | 'staff'> = {
  manager: ['view_orders', 'manage_menu', 'manage_staff', 'view_audit', 'refund_orders'],
  staff: ['view_orders'],
};

export function permissionsForRole(
  role: ShopRoleKey,
  doc: Pick<RolePermissionsDoc, 'manager' | 'staff'>,
): ShopPermission[] {
  return role === 'owner' ? [...ALL_SHOP_PERMISSIONS] : [...doc[role]];
}
