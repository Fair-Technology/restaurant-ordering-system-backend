import { Shop } from '../../../domain/shop/Shop';

export interface PublicShopBrandingDto {
  logoUrl: string | null;
  heroImageUrl: string | null;
  accentColor: string | null;
  showHero: boolean; // stored absent → true
}

export interface PublicShopSummaryDto {
  id: string;
  slug: string;
  name: string;
  address: { city: string | null; postcode: string | null }; // trimmed; '' or absent → null
  branding: PublicShopBrandingDto | null;
  openingHours: Partial<Shop['openingHours']>; // absent → {}
  timezone: string;
  ordersPaused: boolean; // stored absent → false
}

export interface GetPublicShopsResultDto {
  shops: PublicShopSummaryDto[]; // sorted by name
}
