import { ShopUsage } from './ShopUsage';

export interface UsageRepository {
  findByShopId(shopId: string): Promise<ShopUsage | null>;
  upsert(usage: ShopUsage): Promise<ShopUsage>;
  incrementAcceptedOrders(shopId: string, periodKey: string): Promise<ShopUsage>;
}
