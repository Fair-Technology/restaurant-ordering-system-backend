import { MenuLanguage } from '../reference/ReferenceLists';
import { ShopLegal } from '../legal/legalTexts';
import type { StoredOrderSettings } from '../order/orderSettings';
import type { BusyMode } from '../order/kitchenTiming';

export interface ShopBranding {
  logoUrl: string | null;
  heroImageUrl: string | null;
  accentColor: string | null;
}

export type ShopRoleKey = 'owner' | 'manager' | 'staff';

export type ShopPermission =
  | 'view_orders'
  | 'manage_menu'
  | 'manage_shop'
  | 'manage_staff'
  | 'manage_billing'
  | 'view_audit'
  | 'refund_orders'
  | 'view_reports';

export const ALL_SHOP_PERMISSIONS: readonly ShopPermission[] = [
  'view_orders',
  'manage_menu',
  'manage_shop',
  'manage_staff',
  'manage_billing',
  'view_audit',
  'refund_orders',
  'view_reports',
];

export interface DpaAcceptance {
  version: string;
  acceptedAt: string; // ISO
  acceptedByUserId: string;
  shopNameAtAcceptance: string;
}

export interface Shop {
  // Identity
  id: string; // UUID (Cosmos item id)
  slug: string; // globally unique, public identifier
  name: string;

  // Industry / business type
  industry?: string;

  // State & visibility
  isDeleted: boolean; // soft delete
  isPaused: boolean;
  pausedMessage?: string; // required if isPaused === true

  // Checkout
  orderAcceptanceMode: 'auto'; // fixed for now

  // Locale & rules
  currency: string; // ISO code, e.g. "AUD"
  timezone: string; // e.g. "Australia/Sydney"
  minOrderAmountCents: number;

  // Address (structured)
  address: {
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };

  // Opening hours (per weekday)
  openingHours: Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    Array<{
      open: string; // "HH:mm"
      close: string; // "HH:mm"
    }>
  >;

  // One-off closures / holidays
  closures: Array<{
    id: string;
    start: string; // ISO datetime
    end: string; // ISO datetime
    reason?: string;
  }>;

  // Admins & staff (only owners are Entra members; custom roles removed)
  members: Array<{
    userId: string; // Entra object id
    role: 'owner';
    isActive: boolean;
  }>;

  // Tax configuration
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "AU", "DE"

  // Menu languages: [original, ...additional]. Original is fixed at creation.
  menuLanguages: MenuLanguage[];

  // Branding
  branding: ShopBranding | null;

  // Pending name change request (set by owner, cleared on approve/reject)
  pendingNameChange?: {
    requestedName: string;
    requestedSlug: string;
    requestedBy: string; // userId
    requestedAt: string; // ISO timestamp
  } | null;

  // Stripe Connect (payments onboarding)
  stripe?: {
    connectAccountId?: string | null;
    connectOnboardingStatus?: 'not_started' | 'pending' | 'complete' | null;
  } | null;


  // Legal pack: Impressum, terms, withdrawal, privacy addition. Absent on older shops; read via legalOf().
  legal?: ShopLegal;
  // Data processing agreement acceptance. Absent or null = not accepted.
  dpaAcceptance?: DpaAcceptance | null;
  dpaAcceptanceHistory?: DpaAcceptance[];

  // Order alert settings. Absent = defaults; read via orderSettingsOf().
  orderSettings?: StoredOrderSettings | null;
  // Busy mode: absent/null = not busy. Only counts while its serviceDate is today's service day.
  busyMode?: BusyMode | null;

  // Audit
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// Whether a shop's Stripe Connect onboarding is complete enough to accept
// online payment. Every order is paid by card, so this gates both taking orders and going live.
export function stripeReady(shop: Pick<Shop, 'stripe'>): boolean {
  return shop.stripe?.connectOnboardingStatus === 'complete';
}

// What a restaurant's own Stripe account is created with. The country must be the restaurant's:
// left out, Stripe uses the platform's (Fair Technology is registered in Australia), and an
// account's country can never be changed afterwards.
export function stripeAccountCreateParams(shop: Pick<Shop, 'id' | 'countryCode'>) {
  return { country: shop.countryCode, metadata: { shopId: shop.id } };
}
