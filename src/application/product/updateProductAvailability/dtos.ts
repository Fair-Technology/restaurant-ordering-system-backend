export interface UpdateProductAvailabilityRequestDto {
  productId: string;
  shopId: string;
  /** Switch the dish on or off. Omit to leave it as it is. */
  isAvailable?: boolean;
  /**
   * ISO-8601 instant until which the dish is sold out; `null` clears the window.
   * Omit to leave the current window as it is.
   */
  unavailableUntil?: string | null;
}

export interface UpdateProductAvailabilityResultDto {
  id: string;
  shopId: string;
  isAvailable: boolean;
  unavailableUntil: string | null;
  /** True at the moment of the write while the sold-out window is still open. */
  soldOut: boolean;
  updatedAt: string;
}
