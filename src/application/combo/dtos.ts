import type { ComboGroup } from '../../domain/product/combo';
import type { Product } from '../../domain/product/Product';

export interface ComboDto {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  categoryId: string | null; // first categoryIds entry
  isAvailable: boolean;
  bmfDrinkShare: boolean;
  groups: ComboGroup[];
  createdAt: string;
  updatedAt: string;
}

export function toComboDto(p: Product): ComboDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.price,
    categoryId: p.categoryIds[0] ?? null,
    isAvailable: p.isAvailable,
    bmfDrinkShare: p.combo?.bmfDrinkShare ?? false,
    groups: p.combo?.groups ?? [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
