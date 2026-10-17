/** Per-shop count of orders in a row that timed out unanswered. Lives in shop_usage, changed only by atomic patches. */
export interface MissedOrdersDoc {
  id: string;
  kind: 'missed_orders';
  shopId: string;
  streak: number;
  updatedAt: string;
}

export function missedOrdersDocId(shopId: string): string {
  return `missed_orders_${shopId}`;
}
