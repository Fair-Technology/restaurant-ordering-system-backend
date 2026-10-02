import type { MenuLanguage } from '../reference/ReferenceLists';
import { FulfilmentMode, LegalRevisions, OrderItem, TaxBreakdownEntry } from './Order';

export interface CheckoutSession {
  id: string;                    // UUID — also the partition key
  shopId: string;
  stripePaymentIntentId: string;
  items: OrderItem[];            // server-computed, copied directly into Order on success
  subtotalCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  fulfilmentMode: FulfilmentMode;
  taxBreakdown?: TaxBreakdownEntry[];
  language?: MenuLanguage;
  legalRevisions?: LegalRevisions;
  createdAt: string;
  ttl: number;                   // Cosmos TTL in seconds from _ts (set to 3600)
}
