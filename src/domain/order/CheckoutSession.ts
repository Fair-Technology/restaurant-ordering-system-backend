import type { MenuLanguage } from '../reference/ReferenceLists';
import { CustomerAddress, DeliveryAddress, FulfilmentMode, LegalRevisions, OrderCharge, OrderItem, OrderTable, TaxBreakdownEntry } from './Order';

export interface CheckoutSession {
  id: string;                    // UUID — also the partition key
  shopId: string;
  stripePaymentIntentId: string;
  items: OrderItem[];            // server-computed, copied directly into Order on success
  subtotalCents: number;
  totalCents?: number;           // subtotal + charges
  charges?: OrderCharge[];
  deliveryAddress?: DeliveryAddress;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  customerAddress?: CustomerAddress;
  table?: OrderTable;
  fulfilmentMode: FulfilmentMode;
  taxBreakdown?: TaxBreakdownEntry[];
  language?: MenuLanguage;
  legalRevisions?: LegalRevisions;
  customerAccessToken?: string;  // the order-page link token, created at checkout
  idempotencyKey?: string;       // the diner's submit key
  orderRef?: string;             // human-readable reference, created at checkout
  createdAt: string;
  ttl: number;                   // Cosmos TTL in seconds from _ts (set to 3600)
}
