/** One ticked order line in an item refund: which line, and how many units of it. */
export interface RefundItemRequest {
  lineIndex: number;
  quantity: number;
}

/** Either `items` (refund the ticked units at their own VAT rate) or `amountCents` (a free amount), never both. */
export interface RefundOrderBody {
  items?: RefundItemRequest[];
  amountCents?: number;
  reason: string; // 1-200 chars, internal: never emailed
}
