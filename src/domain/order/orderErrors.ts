// Literal strings: the storefront compares the first two, so they are part of the cross-repo contract.
export const BASKET_CHANGED_ERROR = 'Your basket has changed. Please review it and try again.';
export const LEGAL_CHANGED_ERROR = 'The restaurant has updated its terms. Please review them and order again.';
export const SHOP_CLOSED_ERROR = 'This restaurant is not taking orders right now';
export const PAYMENT_METHOD_NOT_OFFERED_ERROR = 'This restaurant does not accept this payment method';
export const NO_PAYMENT_SETUP_ERROR = 'This shop is not set up to accept payments yet';
export const ORDER_NOT_FOUND_ERROR = 'Order not found';
export const ORDER_CHANGED_ERROR = 'This order was just updated — refresh and try again';
export const CANNOT_CANCEL_ERROR = 'This order can no longer be cancelled. Please call the restaurant.';
export const IDEMPOTENCY_KEY_ERROR = 'idempotencyKey must be 8 to 64 letters, digits or dashes';
export const PREP_MINUTES_ERROR = 'prepMinutes must be a whole number between 5 and 240';
export const REJECT_REASON_ERROR = 'reason must be one of too_busy, item_unavailable, closing_soon, other';
export const BODY_NOT_OBJECT_ERROR = 'Request body must be an object';
