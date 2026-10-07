import { OrderLimitStatus } from '../../../domain/usage/orderLimit';
import { RejectionStats } from '../../../domain/usage/rejectionStats';

export interface RejectionWatchRowDto {
  shopId: string;
  name: string;
  slug: string;
  orderLimit: OrderLimitStatus;
  rejections: RejectionStats;
}

export interface RejectionWatchDto {
  shops: RejectionWatchRowDto[]; // flagged first, then rate desc (null last), then name
}
