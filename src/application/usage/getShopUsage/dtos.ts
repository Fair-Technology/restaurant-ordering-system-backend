import { OrderLimitStatus } from '../../../domain/usage/orderLimit';
import { RejectionStats } from '../../../domain/usage/rejectionStats';
import { ShopUsageDto } from '../shopUsageDto';

export interface GetShopUsageResultDto {
  usage: ShopUsageDto;
  ordersPerMonthLimit: number | null;
  orderLimit: OrderLimitStatus;
  rejections: RejectionStats;
}
