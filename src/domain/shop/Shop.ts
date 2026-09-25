export interface ShopBrandingColors {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
}

export interface ShopBranding {
  logoUrl: string | null;
  heroImageUrl: string | null;
  colors: ShopBrandingColors;
}

export type ShopPermission = 'view_orders' | 'manage_products' | 'manage_shop';

export interface ShopTaxRate {
  id: string; // UUID
  label: string; // e.g. "Standard (19%)", "Reduced (7%)"
  rate: number; // decimal, e.g. 0.19 = 19%, 0.07 = 7%
}

export interface ShopRole {
  id: string; // UUID for custom roles; 'staff' for the seeded default
  name: string; // display name: "Staff", "Kitchen", "Cashier"
  permissions: ShopPermission[];
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

  // Payments & checkout
  paymentPolicy: 'pay_online' | string; // future-ready enum
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

  // Admins & staff
  members: Array<{
    userId: string; // Entra object id
    role: string; // 'owner' is reserved; all other values must match a ShopRole.id
    isActive: boolean;
  }>;

  // Custom roles (owner is hardcoded and not stored here)
  roles: ShopRole[];

  // Tax configuration
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "AU", "DE"
  taxRates: ShopTaxRate[];

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

  // Subscription enforcement
  isDeactivatedDueToLimits?: boolean; // set by webhook when active products exceed free plan limit on cancellation

  // Audit
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
