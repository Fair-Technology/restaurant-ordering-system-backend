import { ShopOptionGroup } from './ShopOptionGroup';

export interface ShopOptionGroupRepository {
  findById(groupId: string, shopId: string): Promise<ShopOptionGroup | null>;
  findByShopId(shopId: string): Promise<ShopOptionGroup[]>;
  create(group: ShopOptionGroup): Promise<ShopOptionGroup>;
  update(group: ShopOptionGroup): Promise<ShopOptionGroup>;
  delete(groupId: string, shopId: string): Promise<void>;
}
