import type { ShopUsage } from './ShopUsage';

export type WarningLevel = 0 | 80 | 90 | 95 | 100;

export interface OrderLimitStatus {
  periodKey: string; // 'YYYY-MM'
  acceptedOrderCount: number;
  limit: number | null; // null = unlimited
  warningLevel: WarningLevel;
  limitReached: boolean;
}

export function thresholdCount(limit: number, percent: number): number {
  return Math.ceil((limit * percent) / 100);
}

export function currentAcceptedCount(
  usage: Pick<ShopUsage, 'periodKey' | 'acceptedOrderCount'> | null,
  periodKey: string,
): number {
  return usage && usage.periodKey === periodKey ? usage.acceptedOrderCount : 0;
}

export function orderLimitStatus(count: number, limit: number | null, periodKey: string): OrderLimitStatus {
  if (limit === null) return { periodKey, acceptedOrderCount: count, limit: null, warningLevel: 0, limitReached: false };
  const limitReached = count >= limit;
  const warningLevel: WarningLevel = limitReached
    ? 100
    : (([95, 90, 80] as const).find((p) => count >= thresholdCount(limit, p)) ?? 0);
  return { periodKey, acceptedOrderCount: count, limit, warningLevel, limitReached };
}

export function crossedLevels(before: number, after: number, limit: number | null): Array<80 | 90 | 95 | 100> {
  if (limit === null) return [];
  return ([80, 90, 95, 100] as const).filter((p) => {
    const at = p === 100 ? limit : thresholdCount(limit, p);
    return before < at && after >= at;
  });
}
