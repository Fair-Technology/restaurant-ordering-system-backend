import { ShopPermission } from '../../../domain/shop/Shop';

export interface RolePermissionsResultDto {
  owner: ShopPermission[];
  manager: ShopPermission[];
  staff: ShopPermission[];
  updatedAt: string | null;
}
