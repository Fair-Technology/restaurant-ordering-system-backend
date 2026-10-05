import type { HttpRequest } from '@azure/functions';
import { AUTO_ACCEPT_ERROR } from '../../../domain/order/orderErrors';
import { EMAIL_PATTERN } from '../../../domain/legal/impressum';
import {
  AUTO_REJECT_MAX_MINUTES,
  AUTO_REJECT_MIN_MINUTES,
  orderSettingsOf,
} from '../../../domain/order/orderSettings';
import { findShopById, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import type { ApplicationResult } from '../../_shared/types';
import type { OrderSettingsResultDto, UpdateOrderSettingsBody } from './dtos';

/** Owner-editable order settings: how long an order may wait before auto-decline, an extra alert address, and whether paid orders are accepted automatically. */
export async function executeUpdateOrderSettings(
  input: { shopId: string; body: Partial<UpdateOrderSettingsBody>; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<OrderSettingsResultDto>> {
  if (!input.shopId || typeof input.shopId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  try {
    const shop = await findShopById(input.shopId);
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const { autoRejectMinutes, alertEmail, autoAccept: requestedAutoAccept } = input.body;
    if (
      typeof autoRejectMinutes !== 'number' ||
      !Number.isInteger(autoRejectMinutes) ||
      autoRejectMinutes < AUTO_REJECT_MIN_MINUTES ||
      autoRejectMinutes > AUTO_REJECT_MAX_MINUTES
    ) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `autoRejectMinutes must be a whole number between ${AUTO_REJECT_MIN_MINUTES} and ${AUTO_REJECT_MAX_MINUTES}`,
      };
    }
    let alert: string | null = null;
    if (alertEmail !== undefined && alertEmail !== null) {
      const trimmed = typeof alertEmail === 'string' ? alertEmail.trim() : null;
      if (trimmed === null || (trimmed !== '' && !EMAIL_PATTERN.test(trimmed))) {
        return { ok: false, code: 'INVALID_INPUT', error: 'alertEmail must be a valid email address or null' };
      }
      alert = trimmed === '' ? null : trimmed;
    }

    if (requestedAutoAccept !== undefined && typeof requestedAutoAccept !== 'boolean') {
      return { ok: false, code: 'INVALID_INPUT', error: AUTO_ACCEPT_ERROR };
    }

    const before = orderSettingsOf(shop);
    const autoAccept = requestedAutoAccept ?? before.autoAccept;
    const orderSettings = { autoRejectMinutes, alertEmail: alert, autoAccept };
    await updateShop({ ...shop, orderSettings, updatedAt: (input.now ?? new Date()).toISOString() });
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.order_settings_update',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      // The address itself is never written to the audit log (spec §11).
      changes: [
        { field: 'autoRejectMinutes', from: before.autoRejectMinutes, to: autoRejectMinutes },
        { field: 'alertEmail', from: null, to: null },
        { field: 'autoAccept', from: before.autoAccept, to: autoAccept },
      ],
    });
    return { ok: true, data: orderSettings };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update order settings' };
  }
}
