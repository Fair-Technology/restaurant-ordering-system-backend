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
  paymentPolicy: string;
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
  createdAt: string;
  updatedAt: string;
}
