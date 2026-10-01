import { ShopBranding } from '../../../domain/shop/Shop';

export interface CreateShopRequestDto {
  // Required fields from user
  name: string;
  countryCode: string;
  currency: string;
  timezone: string;
  paymentPolicy?: 'pay_online' | 'pay_in_person';
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

  // Required
  industry: string;

  // Optional fields
  pausedMessage?: string;
  orderAcceptanceMode?: 'auto';
  closures?: Array<{
    id: string;
    start: string;
    end: string;
    reason?: string;
  }>;
  branding?: ShopBranding | null;

  // Version of the data processing agreement the owner ticked. Absent = not accepted yet.
  acceptDpaVersion?: string;
}

export interface CreateShopResultDto {
  id: string;
  slug: string;
  name: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
