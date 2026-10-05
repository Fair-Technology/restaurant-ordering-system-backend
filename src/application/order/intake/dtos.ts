import type { FulfilmentMode, StaffRejectReason } from '../../../domain/order/Order';
import type { OrderDto } from '../getOrdersByShop/dtos';

export interface OrderQueueDto {
  serverTime: string;
  timezone: string; // the restaurant's, so a tablet elsewhere shows its times correctly
  defaultPrepMinutes: Record<FulfilmentMode, number>;
  orders: OrderDto[];
}

export interface AcceptOrderBody {
  prepMinutes?: number; // absent → DEFAULT_PREP_MINUTES[order.fulfilmentMode]
}

export interface RejectOrderBody {
  reason: StaffRejectReason;
  note?: string; // ≤ 300 chars, staff-only
}
