export interface ShopUsage {
  id: string; // === shopId
  shopId: string;
  periodKey: string; // 'YYYY-MM' in the shop's timezone
  acceptedOrderCount: number;
  lastReconciled: string | null;
  createdAt: string;
  updatedAt: string;
}
