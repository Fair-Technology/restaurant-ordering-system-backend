import { Category } from '../../domain/category/Category';
import { ImpressumFieldKey, ImpressumFields, ImpressumLine, LegalLanguage } from '../../domain/legal/impressum';
import { PlatformLegalIdentity } from '../../domain/legal/PlatformLegalIdentity';
import { SubProcessor } from '../../domain/legal/platformDocuments';
import { PrivacyNotice } from '../../domain/legal/privacyNotice';
import { Order } from '../../domain/order/Order';
import { Product } from '../../domain/product/Product';
import { MenuLanguage } from '../../domain/reference/ReferenceLists';
import { DpaAcceptance, Shop } from '../../domain/shop/Shop';

export interface LegalTextDto {
  text: string;
  revision: number;
  updatedAt: string;
}

export interface ShopLegalSettingsDto {
  impressum: ImpressumFields | null; // StoredImpressum minus updatedAt/updatedBy
  terms: LegalTextDto | null;
  withdrawal: LegalTextDto | null;
  privacyAddition: LegalTextDto | null;
  missingImpressumFields: ImpressumFieldKey[];
  completeness: { dpa: boolean; impressum: boolean; terms: boolean; withdrawal: boolean; privacyNotice: boolean };
  dpa: { currentVersion: string; currentIsDraft: boolean; accepted: DpaAcceptance | null };
  platformIdentityComplete: boolean;
  callerIsOwner: boolean;
}

export interface UpdateShopLegalBody {
  impressum?: unknown;
  terms?: string;
  withdrawal?: string;
  privacyAddition?: string;
}

export interface AcceptDpaBody {
  version: string;
}

export interface PublicLegalPackDto {
  slug: string;
  shopName: string;
  language: LegalLanguage;
  impressum: { lines: ImpressumLine[] } | null; // null unless isImpressumComplete
  terms: LegalTextDto | null; // null unless published
  withdrawal: LegalTextDto | null;
  privacyNotice: PrivacyNotice | null; // null unless impressum complete && platform identity complete
  seller: { legalName: string; phone: string | null }; // legalName = complete impressum ? impressum.legalName : shop.name
  platform: { name: string; salesSiteUrl: string | null };
}

export interface PlatformLegalPublicDto {
  platformName: string;
  salesSiteUrl: string | null;
  operator: PlatformLegalIdentity['operator'];
  euRepresentative: PlatformLegalIdentity['euRepresentative'];
  subProcessors: SubProcessor[];
  currentDpaVersion: string;
  currentDpaIsDraft: boolean;
}

export type PlatformLegalIdentityDto = Omit<PlatformLegalIdentity, 'id'>;

export interface ExportCustomer {
  name: string;
  email: string;
  phone: string;
  orderCount: number;
  firstOrderAt: string;
  lastOrderAt: string;
}

// customerNotes and the two secrets (order-link token, idempotency key) are never exported.
export type ExportOrder = Omit<Order, 'customerNotes' | 'customerAccessToken' | 'idempotencyKey'>;

export interface ShopDataExportDto {
  formatVersion: 1;
  exportedAt: string;
  shop: {
    id: string;
    slug: string;
    name: string;
    countryCode: string;
    currency: string;
    timezone: string;
    address: Shop['address'];
    openingHours: Shop['openingHours'];
    menuLanguages: MenuLanguage[];
    impressum: ImpressumFields | null;
    terms: string | null;
    withdrawal: string | null;
    privacyAddition: string | null;
  };
  categories: Category[]; // non-deleted; Cosmos keys _rid,_self,_etag,_attachments,_ts removed
  products: Product[];
  orders: ExportOrder[]; // all, newest first, same key removal
  customers: ExportCustomer[]; // sorted lastOrderAt desc
}

export interface EraseCustomerBody {
  email: string;
}

export interface EraseCustomerResultDto {
  anonymisedOrderCount: number;
}
