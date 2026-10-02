import type {
  FulfilmentMode,
  OrderState,
  PaymentMethod,
  PaymentStatus,
  RejectReason,
  StoredOrderState,
} from '../../../domain/order/Order';
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
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
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
