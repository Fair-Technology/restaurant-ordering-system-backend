import { Order, StoredOrderState } from '../order/Order';

export const CLOSED_ORDER_STATES: readonly StoredOrderState[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
export const ANONYMISED_CUSTOMER_NAME = 'Deleted customer';

/** Strips the diner's personal data; the order itself stays for the restaurant's tax records. */
export function anonymiseOrder(o: Order, now: string): Order {
  const { customerNotes: _removedNotes, customerAccessToken: _removedToken, ...rest } = o;
  return {
    ...rest,
    customerName: ANONYMISED_CUSTOMER_NAME,
    customerEmail: '',
    customerPhone: '',
    anonymisedAt: now,
    updatedAt: now,
  };
}
