import type { Order } from '../order/Order';
import type { WarningLevel } from './orderLimit';

export const REJECTION_WINDOW_DAYS = 30;
export const REJECTION_RATE_FLAG = 0.2;
export const REJECTION_MIN_DECIDED = 10;
export const SPIKE_WINDOW_DAYS = 7;
export const SPIKE_MIN_REJECTIONS = 3;

export type RejectionFlag = 'high_rate' | 'spike_near_limit';
export type OrderForRejectionStats = Pick<Order, 'createdAt' | 'acceptedAt' | 'history'>;

export interface RejectionStats {
  windowDays: number;
  accepted: number;
  rejectedByRestaurant: number;
  rate: number | null; // null when nothing was decided
  recentRejections: number; // restaurant declines in the last SPIKE_WINDOW_DAYS
  flags: RejectionFlag[];
}

export function isRestaurantRejection(o: Pick<Order, 'history'>): boolean {
  const last = [...o.history].reverse().find((h) => h.to === 'REJECTED');
  return !!last && (last.actor.type === 'owner' || last.actor.type === 'staff' || last.actor.type === 'superadmin');
}

export function rejectionStats(orders: OrderForRejectionStats[], now: Date, warningLevel: WarningLevel): RejectionStats {
  const day = 86_400_000;
  const since = now.getTime() - REJECTION_WINDOW_DAYS * day;
  const spikeSince = now.getTime() - SPIKE_WINDOW_DAYS * day;
  const inWindow = orders.filter((o) => Date.parse(o.createdAt) >= since);
  const accepted = inWindow.filter((o) => typeof o.acceptedAt === 'string').length;
  const declined = inWindow.filter(isRestaurantRejection);
  const rejectedByRestaurant = declined.length;
  const decided = accepted + rejectedByRestaurant;
  const rate = decided === 0 ? null : rejectedByRestaurant / decided;
  const recentRejections = declined.filter((o) => Date.parse(o.createdAt) >= spikeSince).length;
  const flags: RejectionFlag[] = [];
  if (rate !== null && decided >= REJECTION_MIN_DECIDED && rate >= REJECTION_RATE_FLAG) flags.push('high_rate');
  if (warningLevel >= 80 && recentRejections >= SPIKE_MIN_REJECTIONS) flags.push('spike_near_limit');
  return { windowDays: REJECTION_WINDOW_DAYS, accepted, rejectedByRestaurant, rate, recentRejections, flags };
}
