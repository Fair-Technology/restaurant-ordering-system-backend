import type {
  DeliveryAddress,
  FulfilmentMode,
  OrderState,
  DisplayPaymentStatus,
  RejectReason,
  StoredOrderState,
} from '../../../domain/order/Order';
import type { OrderDocumentDto } from '../invoices/issueInvoice';
import type { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface CustomerOrderTokenBody {
  token: string;
}

export interface CustomerOrderDto {
  orderId: string;
  orderRef: string;
  shopSlug: string;
  shopName: string;
  sellerPhone: string | null;
  timezone: string;
  language: MenuLanguage;
  state: StoredOrderState;
  displayState: OrderState;
  fulfilmentMode: FulfilmentMode;
  table: { label: string } | null;
  scheduledFor: string | null; // the booked time; null = as soon as possible
  paymentStatus: DisplayPaymentStatus;
  refundedCents: number;
  documents: OrderDocumentDto[];
  readyAt: string | null;
  items: Array<{
    productName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    selectedVariantOptionName: string | null;
    selectedAddonOptionNames: string[];
  }>;
  subtotalCents: number;
  totalCents: number; // items plus delivery fee
  deliveryFeeCents: number | null; // null = not a delivery order; 0 = free delivery
  deliveryAddress: DeliveryAddress | null;
  currency: string;
  createdAt: string;
  canCancel: boolean; // state === 'PLACED'
  rejectionReason: RejectReason | null;
}
