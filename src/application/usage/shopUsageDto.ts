import { ShopUsage } from '../../domain/usage/ShopUsage';

export interface ShopUsageDto {
  shopId: string;
  periodKey: string;
  acceptedOrderCount: number;
  lastReconciled: string | null;
  updatedAt: string;
}

export function toShopUsageDto(usage: ShopUsage): ShopUsageDto {
  return {
    shopId: usage.shopId,
    periodKey: usage.periodKey,
    acceptedOrderCount: usage.acceptedOrderCount,
    lastReconciled: usage.lastReconciled,
    updatedAt: usage.updatedAt,
  };
}
