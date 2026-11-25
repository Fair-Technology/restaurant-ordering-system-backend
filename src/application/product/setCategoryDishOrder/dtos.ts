export interface SetCategoryDishOrderRequestDto {
  shopId: string;
  categoryId: string;
  productIds: string[]; // the category's complete dish set, in the intended order
}

export interface SetCategoryDishOrderResultDto {
  categoryId: string;
  /** The saved order, first to last. */
  products: Array<{ id: string; name: string }>;
}
