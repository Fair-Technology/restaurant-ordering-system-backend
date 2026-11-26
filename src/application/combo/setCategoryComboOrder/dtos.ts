export interface SetCategoryComboOrderRequestDto {
  shopId: string;
  categoryId: string;
  productIds: string[]; // the category's complete combo set, in the intended order
}

export interface SetCategoryComboOrderResultDto {
  categoryId: string;
  products: Array<{ id: string; name: string }>;
}
