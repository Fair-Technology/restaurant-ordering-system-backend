import { ShopUsageDto } from '../shopUsageDto';

export interface ReconcileShopUsageResultDto {
  usage: ShopUsageDto;
  reconciledCount: number;
}
