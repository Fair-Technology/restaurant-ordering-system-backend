import { FulfilmentMode } from '../../../domain/order/Order';
import { DeliveryZone } from '../../../domain/order/orderSettings';
import { ShopBranding } from '../../../domain/shop/Shop';

export interface GetShopBySlugRequestDto {
  slug: string;
}

export interface GetShopBySlugResultDto {
  id: string;
  slug: string;
  name: string;
  isDeleted: boolean;
  isPaused: boolean;
  pausedMessage?: string;
  orderAcceptanceMode: string;
  currency: string;
  timezone: string;
  minOrderAmountCents: number;
  address: {
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  openingHours: Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    Array<{
      open: string;
      close: string;
    }>
  >;
  closures: Array<{
    id: string;
    start: string;
    end: string;
    reason?: string;
  }>;
  branding: ShopBranding | null;
  countryCode: string;
  fulfilment: {
    modes: FulfilmentMode[];
    prepMinutes: Record<FulfilmentMode, number>;
    delivery: { zones: DeliveryZone[] } | null; // present while delivery is offered
  };
  orderLimitReached: boolean; // true = online ordering is paused for this month
  createdAt: string;
  updatedAt: string;
}
