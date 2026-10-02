import type { FulfilmentMode, StaffRejectReason } from '../../../domain/order/Order';
import type { OrderDto } from '../getOrdersByShop/dtos';

export interface OrderQueueDto {
  serverTime: string;
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
