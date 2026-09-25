export interface CatalogProductDto {
  id: string;
  name: string;
  description: string;
  price: number;
  offerPrice?: number | null;
  offerLabel?: string | null;
  images: { id: string; url: string; alt?: string; sortOrder: number }[];
  variants: unknown[];
  addons: unknown[];
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogCategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  icon?: string;
  products: CatalogProductDto[];
}

export interface GetCatalogResultDto {
  categories: CatalogCategoryDto[];
}
