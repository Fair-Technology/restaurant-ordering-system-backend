import type { OrdersAutoPaused } from '../../../domain/shop/ordersPause';
import { ShopBranding, ShopPermission, ShopRoleKey } from '../../../domain/shop/Shop';
import { OrderSettings } from '../../../domain/order/orderSettings';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface GetShopRequestDto {
  shopId: string;
}

export interface GetShopResultDto {
  id: string;
  slug: string;
  name: string;
  isDeleted: boolean;
  deletedAt?: string;
  isPaused: boolean;
  pausedMessage?: string;
  ordersPaused: boolean; // in force now (an expired timed pause reads false)
  ordersPausedUntil: string | null; // end of a timed pause; null = until switched back
  ordersAutoPaused: OrdersAutoPaused | null; // set when missed orders paused the shop
  ordersPausedMessage?: string;
  isOffline: boolean; // isPaused || offlineBySuperadmin
  offlineBySuperadmin: boolean;
  offlineBySuperadminReason?: string;
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
  callerRole: ShopRoleKey | 'superadmin' | null;
  callerPermissions: ShopPermission[];
  countryCode: string;
  menuLanguages: MenuLanguage[];
  branding: ShopBranding | null;
  pendingNameChange: {
    requestedName: string;
    requestedSlug: string;
    requestedBy: string;
    requestedAt: string;
  } | null;
  stripe: {
    connectAccountId: string | null;
    connectOnboardingStatus: 'not_started' | 'pending' | 'complete' | null;
  } | null;
  orderSettings: OrderSettings;
  createdAt: string;
  updatedAt: string;
}
