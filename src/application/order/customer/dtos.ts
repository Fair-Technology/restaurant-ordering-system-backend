import type {
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
  currency: string;
  createdAt: string;
  canCancel: boolean; // state === 'PLACED'
  rejectionReason: RejectReason | null;
}
