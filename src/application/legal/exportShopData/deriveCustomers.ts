import { Order } from '../../../domain/order/Order';
import { ExportCustomer } from '../dtos';

/** One entry per customer email (case-insensitive); anonymised orders and orders without an email are skipped. */
export function deriveCustomers(orders: Order[]): ExportCustomer[] {
  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const email = o.customerEmail?.trim() ?? '';
    if (o.anonymisedAt || email === '') continue;
    const key = email.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const customers: ExportCustomer[] = [];
  for (const [email, group] of groups) {
    const byDate = [...group].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const newest = byDate[0];
    customers.push({
      name: newest.customerName,
      email,
      phone: newest.customerPhone,
      orderCount: group.length,
      firstOrderAt: byDate[byDate.length - 1].createdAt,
      lastOrderAt: newest.createdAt,
    });
  }
  return customers.sort((a, b) => (a.lastOrderAt < b.lastOrderAt ? 1 : a.lastOrderAt > b.lastOrderAt ? -1 : 0));
}
