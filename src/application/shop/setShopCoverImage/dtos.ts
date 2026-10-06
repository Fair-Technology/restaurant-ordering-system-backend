import { Shop } from '../../../domain/shop/Shop';

export interface SetShopCoverImageRequestDto {
  shopId: string;
  imageId: string;
  url: string;
}

export type ShopCoverImageResultDto = Pick<Shop, 'id' | 'slug' | 'name' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'branding'>;

export function toCoverImageResult(s: Shop): ShopCoverImageResultDto {
  return { id: s.id, slug: s.slug, name: s.name, isDeleted: s.isDeleted, createdAt: s.createdAt, updatedAt: s.updatedAt, branding: s.branding };
}
