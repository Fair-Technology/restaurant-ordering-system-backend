import {
  CustomerAddress,
  DisplayPaymentStatus,
  FulfilmentMode,
  OrderHistoryEntry,
  OrderState,
  StoredOrderState,
  TaxBreakdownEntry,
} from '../../../domain/order/Order';
import type { OrderDocumentDto } from '../invoices/issueInvoice';

export type GetOrdersByShopRequestDto = {
  shopId: string;
  page?: number;
  pageSize?: number;
};

export type OrderItemDto = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  selectedVariantOptionId?: string | null;
  selectedVariantOptionName?: string | null;
  selectedAddonOptionIds?: string[] | null;
  selectedAddonOptionNames?: string[] | null;
  lineTotalCents: number;
};

export type OrderDto = {
  id: string;
  orderRef: string;
  state: StoredOrderState;
  displayState: OrderState;
  fulfilmentMode: FulfilmentMode;
  table: { label: string } | null;
  paymentStatus: DisplayPaymentStatus;
  readyAt: string | null;
  items: OrderItemDto[];
  subtotalCents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  history: OrderHistoryEntry[];
  createdAt: string;
  autoRejectAt: string | null;
  acceptedAt: string | null;
  prepMinutes: number | null;
  taxBreakdown: TaxBreakdownEntry[];
  rejectionNote: string | null;
  customerAddress: CustomerAddress | null;
  refundedCents: number;
  refunds: Array<{
    amountCents: number;
    reason: string;
    at: string;
    lines: Array<{ lineIndex: number; quantity: number }>;
  }>;
  releaseFailure: { at: string; message: string } | null;
  documents: OrderDocumentDto[];
  autoAccepted: boolean;
};

export type GetOrdersByShopResultDto = {
  orders: OrderDto[];
  total: number;
  page: number;
  pageSize: number;
};
