export interface UpdateProductAvailabilityRequestDto {
  productId: string;
  shopId: string;
  /** Switch the dish on or off. Omit to leave it as it is. */
  isAvailable?: boolean;
}

export interface UpdateProductAvailabilityResultDto {
  id: string;
  shopId: string;
  isAvailable: boolean;
  updatedAt: string;
}
