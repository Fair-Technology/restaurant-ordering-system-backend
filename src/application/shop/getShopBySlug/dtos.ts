import { FulfilmentMode } from '../../../domain/order/Order';
import { DeliveryZone, WeeklyHours } from '../../../domain/order/orderSettings';
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
  phone: string | null; // from the legal notice; null until the owner fills it in
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
    delivery: { zones: DeliveryZone[]; hours: WeeklyHours | null } | null; // present while delivery is offered; hours null = same as opening hours
  };
  orderLimitReached: boolean; // true = online ordering is paused for this month
  createdAt: string;
  updatedAt: string;
}
