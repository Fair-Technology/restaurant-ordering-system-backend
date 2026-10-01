import { ShopPermission } from '../../../domain/shop/Shop';

export interface UpdateRolePermissionsRequestDto {
  manager: ShopPermission[];
  staff: ShopPermission[];
}

export interface RolePermissionsResultDto {
  owner: ShopPermission[];
  manager: ShopPermission[];
  staff: ShopPermission[];
  updatedAt: string | null;
}
