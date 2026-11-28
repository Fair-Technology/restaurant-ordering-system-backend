export type GetLoyaltyVouchersRequestDto = {
  shopId: string;
  page?: number;
  pageSize?: number;
};

/** Never carries the diner's email or name. */
export type LoyaltyVoucherDto = {
  code: string;
  amountCents: number;
  issuedAt: string; // ISO instant
  expiresOn: string; // 'YYYY-MM-DD' shop-local, inclusive
  used: boolean;
  orderRef: string | null; // the order that earned it; null if that order cannot be found
};

export type GetLoyaltyVouchersResultDto = {
  vouchers: LoyaltyVoucherDto[];
  total: number;
  page: number;
  pageSize: number;
};
