// Literal strings: the storefront compares the first two, so they are part of the cross-repo contract.
export const BASKET_CHANGED_ERROR = 'Your basket has changed. Please review it and try again.';
export const LEGAL_CHANGED_ERROR = 'The restaurant has updated its terms. Please review them and order again.';
export const SHOP_CLOSED_ERROR = 'This restaurant is not taking orders right now';
export const NO_PAYMENT_SETUP_ERROR = 'This shop is not set up to accept payments yet';
export const ORDER_NOT_FOUND_ERROR = 'Order not found';
export const ORDER_CHANGED_ERROR = 'This order was just updated — refresh and try again';
export const CANNOT_CANCEL_ERROR = 'This order can no longer be cancelled. Please call the restaurant.';
export const IDEMPOTENCY_KEY_ERROR = 'idempotencyKey must be 8 to 64 letters, digits or dashes';
export const PREP_MINUTES_ERROR = 'prepMinutes must be a whole number between 5 and 240';
export const REJECT_REASON_ERROR = 'reason must be one of too_busy, item_unavailable, closing_soon, other';
export const BODY_NOT_OBJECT_ERROR = 'Request body must be an object';
export const PAYMENT_METHOD_ERROR = 'paymentMethod must be card';
export const PAYMENT_CONFIRMING_ERROR = 'Your payment is being confirmed';
export const PAYMENT_CAPTURE_FAILED_ERROR =
  'The payment could not be taken, so the order was declined and the customer told. Nothing was charged.';
export const PAYMENT_SERVICE_UNAVAILABLE_ERROR =
  'The payment service did not answer. The order is still waiting — please try again.';
export const ADDRESS_INVALID_ERROR =
  'customerAddress must have street, postcode, city and country of at most 200 characters each';
export const ADDRESS_REQUIRED_ERROR = 'An address is required for orders over 250 €';
export const REFUND_MODE_ERROR = 'Send either items or amountCents, not both';
export const REFUND_ITEMS_ERROR = 'items must list order lines with whole quantities, each line once';
export function refundQuantityError(lineIndex: number, left: number): string {
  return `Only ${left} of line ${lineIndex + 1} can still be refunded`;
}
export const REFUND_RATE_EXCEEDED_ERROR =
  'Part of these items was already refunded as a free amount — refund a free amount instead';
export const REFUND_AMOUNT_ERROR = 'Refund amount must be between 1 cent and the amount not yet refunded';
export const REFUND_REASON_ERROR = 'reason is required and must be at most 200 characters';
export const REFUND_STATE_ERROR =
  'Only accepted, ready or completed orders can be refunded here. Declining a waiting order releases the payment for free.';
export const REFUND_FAILED_PREFIX = 'Stripe could not make the refund: ';
export const DOCUMENT_NOT_FOUND_ERROR = 'This document does not exist yet';
export const GO_LIVE_STRIPE_ERROR = 'Stripe payments onboarding is not complete';
export const GO_LIVE_TAX_ID_ERROR = 'Enter a tax number or VAT ID for invoices before going live';
export const AUTO_ACCEPT_ERROR = 'autoAccept must be true or false';
export const TAX_NUMBER_ERROR = 'taxNumber must be at most 30 characters';
export const MODE_NOT_OFFERED_ERROR = 'This restaurant is not taking orders this way right now'; // storefront compares
export const TABLE_INVALID_ERROR = 'Please scan the QR code on your table again'; // storefront compares
export const DINE_IN_ERROR = 'dineIn must be true or false';
export const ORDER_LIMIT_REACHED_ERROR = 'This restaurant has paused online ordering for now';
// Plan changes. The admin shows these as they are.
export const UPGRADE_DECLINED_ERROR = 'The card was declined, so the plan was not changed';
export const PAYMENT_DECLINED_AGAIN_ERROR = 'The card was declined again';
export function downgradeBlockedStaffError(allowed: number): string {
  return `Remove staff logins first: the target plan allows ${allowed}`;
}
export const AUTO_ACCEPT_HOURS_ERROR = 'autoAcceptHours must be null or a weekly list of HH:mm times';
export const PREP_SETTING_ERROR = 'prepMinutes must give whole minutes between 5 and 120 for collection, delivery or dine_in';
export const LAST_ORDERS_ERROR = 'lastOrdersMinutes must be null or a whole number between 0 and 120';
export const BUSY_MINUTES_ERROR = 'busyExtraMinutes must be a whole number between 5 and 120';
export const BUSY_MODE_BODY_ERROR = 'on must be true or false';
export const DELIVERY_ADDRESS_INVALID_ERROR = 'deliveryAddress must have street, postcode and city of at most 200 characters each';
export const DELIVERY_POSTCODE_NOT_SERVED_ERROR = 'This restaurant does not deliver to this postcode'; // storefront compares
export const DELIVERY_FEE_CHANGED_ERROR = 'The delivery fee has changed. Please check your order and try again.'; // storefront compares
export const EXPECTED_FEE_ERROR = 'expectedDeliveryFeeCents must be a whole number of cents';
export const DELIVERY_ERROR = 'delivery must be true or false';
export const DELIVERY_ZONES_ERROR =
  'deliveryZones must list up to 200 different postcodes, each with a fee of 0 to 100 € and a minimum order of 0 to 1000 € in whole cents';
export const DELIVERY_HOURS_ERROR = 'deliveryHours must be null or a weekly list of HH:mm times';
export const DELIVERY_FEE_TAX_CLASS_ERROR = "deliveryFeeTaxClassId must be null or one of this country's tax classes";
export const UNAVAILABLE_MODES_ERROR = 'unavailableModes must list collection, delivery or dine_in';
export const SCHEDULED_FOR_ERROR = 'scheduledFor must be the start of a 15-minute slot, as an ISO date and time';
export const SCHEDULE_NOT_FOR_TABLES_ERROR = 'Table orders cannot be scheduled';
export const SLOT_UNAVAILABLE_ERROR = 'This time is no longer available. Please choose another.'; // storefront compares
export const SCHEDULED_NOT_DUE_ERROR = 'This order is for later. It can be accepted once it moves to New.';
export const SCHEDULED_ORDERS_ERROR = 'scheduledOrders must be true or false';
export const SLOT_CAPACITY_ERROR = 'slotCapacity must be null or a whole number between 1 and 50';
export const DISCOUNT_CHANGED_ERROR = 'Your discount has changed. Please check your order and try again.'; // storefront compares
export const DISCOUNT_ALREADY_USED_ERROR = 'You have already used this code.'; // storefront compares
export const DISCOUNT_CODE_FORMAT_ERROR = 'discountCode must be 3 to 20 letters, digits or dashes';
export const EXPECTED_DISCOUNT_ERROR = 'expectedDiscountCents must be a whole number of cents';
export const LOYALTY_OPT_IN_ERROR = 'loyaltyOptIn must be true or false';
