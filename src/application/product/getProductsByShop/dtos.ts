import { Product, ProductImage, ProductSchedule } from '../../../domain/product/Product';
import { ProductMenuFieldsDto } from '../menuFieldsDto';

export interface GetProductsByShopRequestDto {
  shopId: string;
}

export interface ProductDto extends ProductMenuFieldsDto {
  // Identity & ownership
  id: string;
  shopId: string;

  // Core info
  name: string;
  description: string;

  // Pricing
  price: number;

  // Categorisation
  categories: Array<{
    id: string;
    name: string;
    sortOrder: number;
    icon?: string;
  }>;

  // Images
  images: ProductImage[];

  // Variants (optional)
  variantGroups: Product['variantGroups'];

  // Addons (optional)
  addonGroups: Product['addonGroups'];

  // Availability schedule (optional)
  schedule?: ProductSchedule | null;

  // Availability & lifecycle
  isAvailable: boolean;
  isDeleted: boolean;

  // Audit
  createdAt: string;
  updatedAt: string;
}

export type GetProductsByShopResultDto = ProductDto[];
