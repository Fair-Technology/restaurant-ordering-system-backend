export interface ListOwnersRequestDto {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OwnerSummaryDto {
  userId: string;
  email?: string;
  name?: string;
  maxShops: number | null; // null = using the global default
  effectiveLimit: number; // resolved maxShops ?? config.maxShopsDefault
  shopCount: number; // via findOwnedShopIds — identical rule to the limit check
}

export interface ListOwnersResultDto {
  owners: OwnerSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}
