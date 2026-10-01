import {
  FulfilmentMode,
  OrderHistoryEntry,
  OrderState,
  PaymentMethod,
  PaymentStatus,
  StoredOrderState,
} from '../../../domain/order/Order';

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
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
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
};

export type GetOrdersByShopResultDto = {
  orders: OrderDto[];
  total: number;
  page: number;
  pageSize: number;
};
