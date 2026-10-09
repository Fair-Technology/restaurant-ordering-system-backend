import type { FulfilmentMode, StaffRejectReason } from '../../../domain/order/Order';
import type { BusyState } from '../../../domain/order/kitchenTiming';
import type { OrderDto } from '../getOrdersByShop/dtos';

export type UpcomingOrderDto = OrderDto & { outsideHours: boolean }; // the restaurant is closed at the booked time (as of this read)

export interface SlotCapacityDto {
  perSlot: number; // the limit per quarter hour
  taken: Record<string, number>; // live places per ISO slot start, over the days of the listed upcoming orders
}

export interface OrderQueueDto {
  serverTime: string;
  timezone: string; // the restaurant's, so a tablet elsewhere shows its times correctly
  defaultPrepMinutes: Record<FulfilmentMode, number>; // own prep time + busy minutes, max 240
  busy: BusyState;
  orders: OrderDto[]; // live orders only: booked orders not yet due are under `upcoming`
  upcoming: UpcomingOrderDto[]; // booked orders not yet due, soonest first
  capacity: SlotCapacityDto | null; // null = no limit in force
}

export interface AcceptOrderBody {
  prepMinutes?: number; // absent → effectivePrepMinutes(shop, order.fulfilmentMode, now)
}

export interface RejectOrderBody {
  reason: StaffRejectReason;
  note?: string; // ≤ 300 chars, staff-only
}
