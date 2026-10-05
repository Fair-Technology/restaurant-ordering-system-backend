import { ShopBranding } from '../../../domain/shop/Shop';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface UpdateShopRequestDto {
  shopId: string;
  isPaused?: boolean;
  menuLanguages?: MenuLanguage[];
  pausedMessage?: string;
  minOrderAmountCents?: number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  branding?: ShopBranding | null;
  openingHours?: Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    Array<{ open: string; close: string }>
  >;
}

export interface UpdateShopResultDto {
  id: string;
  slug: string;
  name: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
