// The area of an audit entry is derived from its action, never stored, so it cannot drift from
// the entries it labels. test/domain/auditAreas.test.ts fails when a new action is left unmapped.
export type AuditArea = 'menu' | 'orders' | 'shop' | 'discounts' | 'staff' | 'subscription';

export const AUDIT_AREAS: readonly AuditArea[] = ['menu', 'orders', 'shop', 'discounts', 'staff', 'subscription'];

const menu: AuditArea = 'menu';
const orders: AuditArea = 'orders';
const shop: AuditArea = 'shop';
const discounts: AuditArea = 'discounts';
const staff: AuditArea = 'staff';
const subscription: AuditArea = 'subscription';

export const AUDIT_ACTION_AREAS: Record<string, AuditArea> = {
  'combo.create': menu,
  'combo.update': menu,
  'product.create': menu,
  'product.update': menu,
  'product.delete': menu,
  'product.availability': menu,
  'category.create': menu,
  'category.update': menu,
  'category.delete': menu,
  'category.dishOrder.update': menu,
  'category.comboOrder.update': menu,
  'optionGroup.create': menu,
  'optionGroup.update': menu,
  'optionGroup.delete': menu,
  'optionGroup.option.enable': menu,
  'optionGroup.option.disable': menu,

  'order.refund': orders,
  'shop.busy_mode': orders,
  'shop.orders_auto_paused': orders,
  'shop.missed_orders_pause_limit': orders,

  'promotion.code_create': discounts,
  'promotion.code_update': discounts,
  'promotion.loyalty_update': discounts,

  'staff.create': staff,
  'staff.update': staff,
  'staff.delete': staff,
  'staff.password_reset': staff,

  'subscription.upgrade': subscription,
  'subscription.change_scheduled': subscription,
  'subscription.cancelScheduled': subscription,
  'subscription.limit_override': subscription,
  'subscription.limit_override_clear': subscription,
  'subscription.payment_retried': subscription,
  'subscription.override': subscription,
  'subscription.change_cancelled': subscription,
  'subscription.override_expired': subscription,
  'subscription.cancelResumed': subscription,

  // Shop settings, profile, compliance and platform housekeeping.
  'shop.data_export': shop,
  'shop.legal_update': shop,
  'shop.dpa_accept': shop,
  'shop.nameChange.approved': shop,
  'shop.nameChange.requested': shop,
  'shop.nameChange.rejected': shop,
  'shop.cover_image': shop,
  'shop.cover_image_remove': shop,
  'shop.logo': shop,
  'shop.logo_remove': shop,
  'shop.offline_by_superadmin': shop,
  'shop.restore': shop,
  'shop.delete': shop,
  'shop.windDown': shop,
  'shop.order_settings_update': shop,
  'shop.invoice_archive': shop,
  'customer.erase': shop,
  'content_report.decided': shop,
  'platform_legal_identity.update': shop,
  'role_permissions.update': shop,
  'config.maxShopsDefault.update': shop,
  'config.emailEnabled.update': shop,
  'config.scheduleHorizonDays.update': shop,
  'reference_lists.update': shop,
  'user.limits.update': shop,
};

export function auditAreaForAction(action: string): AuditArea | undefined {
  return AUDIT_ACTION_AREAS[action];
}

export function actionsForArea(area: AuditArea): string[] {
  return Object.keys(AUDIT_ACTION_AREAS).filter((a) => AUDIT_ACTION_AREAS[a] === area);
}
