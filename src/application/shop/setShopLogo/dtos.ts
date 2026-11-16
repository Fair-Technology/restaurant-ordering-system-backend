import { Shop } from '../../../domain/shop/Shop';

export interface SetShopLogoRequestDto {
  shopId: string;
  imageId: string;
  url: string;
}

export type SetShopLogoResultDto = Pick<Shop, 'id' | 'slug' | 'name' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'branding'>;

export function toLogoResult(s: Shop): SetShopLogoResultDto {
  return { id: s.id, slug: s.slug, name: s.name, isDeleted: s.isDeleted, createdAt: s.createdAt, updatedAt: s.updatedAt, branding: s.branding };
}
