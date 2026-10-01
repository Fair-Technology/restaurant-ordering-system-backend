import { ShopUsageDto } from '../shopUsageDto';

export interface GetShopUsageResultDto {
  usage: ShopUsageDto;
  ordersPerMonthLimit: number | null;
}
