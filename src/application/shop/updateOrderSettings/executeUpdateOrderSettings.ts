import type { HttpRequest } from '@azure/functions';
import { FULFILMENT_MODES, type FulfilmentMode } from '../../../domain/order/Order';
import { describeDeliveryZones, parseDeliveryZones } from '../../../domain/order/delivery';
import { describePrepMinutes, describeWeeklyHours, parseWeeklyHours } from '../../../domain/order/kitchenTiming';
import {
  AUTO_ACCEPT_ERROR,
  AUTO_ACCEPT_HOURS_ERROR,
  BUSY_MINUTES_ERROR,
  DELIVERY_ERROR,
  DELIVERY_FEE_TAX_CLASS_ERROR,
  DELIVERY_HOURS_ERROR,
  DELIVERY_ZONES_ERROR,
  DINE_IN_ERROR,
  LAST_ORDERS_ERROR,
  PREP_SETTING_ERROR,
  SCHEDULED_ORDERS_ERROR,
  SLOT_CAPACITY_ERROR,
} from '../../../domain/order/orderErrors';
import { parseSlotCapacity } from '../../../domain/order/slotCapacity';
import { EMAIL_PATTERN } from '../../../domain/legal/impressum';
import {
  AUTO_REJECT_MAX_MINUTES,
  AUTO_REJECT_MIN_MINUTES,
  BUSY_MINUTES_MAX,
  BUSY_MINUTES_MIN,
  LAST_ORDERS_MAX,
  PREP_SETTING_MAX,
  PREP_SETTING_MIN,
  orderSettingsOf,
  type OrderSettings,
} from '../../../domain/order/orderSettings';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { findShopWithEtag, replaceShopIfMatch } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import type { Shop } from '../../../domain/shop/Shop';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import type { ApplicationResult } from '../../_shared/types';
import type { OrderSettingsResultDto, UpdateOrderSettingsBody } from './dtos';

const MAX_WRITE_ATTEMPTS = 3;
const SETTINGS_CONFLICT_ERROR = 'The settings were changed at the same time. Please try again.';

/** Owner-editable order settings. Changes only the fields sent; everything absent is kept. Returns the full record. */
export async function executeUpdateOrderSettings(
  input: { shopId: string; body: UpdateOrderSettingsBody; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<OrderSettingsResultDto>> {
  if (!input.shopId || typeof input.shopId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  try {
    const initial = await findShopWithEtag(input.shopId);
    if (!initial || initial.shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    const access = await authorizeShopAction(httpRequest, initial.shop, 'manage_shop');
    if (!access.ok) return access;

    const body = input.body as Record<string, unknown>;

    // Merges the sent fields into one read copy of the shop; the caller writes it only if that copy is still current.
    const applyBody = async (
      shop: Shop,
    ): Promise<ApplicationResult<OrderSettingsResultDto> | { ok: 'merged'; before: OrderSettings; next: OrderSettings }> => {
      const before = orderSettingsOf(shop);
      const next: OrderSettings = { ...before, prepMinutes: { ...before.prepMinutes } };
      const invalid = (error: string): ApplicationResult<OrderSettingsResultDto> => ({
        ok: false,
        code: 'INVALID_INPUT',
        error,
      });

      if (body.autoRejectMinutes !== undefined) {
        const v = body.autoRejectMinutes;
        if (
          typeof v !== 'number' ||
          !Number.isInteger(v) ||
          v < AUTO_REJECT_MIN_MINUTES ||
          v > AUTO_REJECT_MAX_MINUTES
        ) {
          return invalid(
            `autoRejectMinutes must be a whole number between ${AUTO_REJECT_MIN_MINUTES} and ${AUTO_REJECT_MAX_MINUTES}`,
          );
        }
        next.autoRejectMinutes = v;
      }
      if (body.alertEmail !== undefined) {
        if (body.alertEmail === null) {
          next.alertEmail = null;
        } else {
          const trimmed = typeof body.alertEmail === 'string' ? body.alertEmail.trim() : null;
          if (trimmed === null || (trimmed !== '' && !EMAIL_PATTERN.test(trimmed))) {
            return invalid('alertEmail must be a valid email address or null');
          }
          next.alertEmail = trimmed === '' ? null : trimmed;
        }
      }
      if (body.autoAccept !== undefined) {
        if (typeof body.autoAccept !== 'boolean') return invalid(AUTO_ACCEPT_ERROR);
        next.autoAccept = body.autoAccept;
      }
      if (body.dineIn !== undefined) {
        if (typeof body.dineIn !== 'boolean') return invalid(DINE_IN_ERROR);
        next.dineIn = body.dineIn;
      }
      if (body.autoAcceptHours !== undefined) {
        const hours = parseWeeklyHours(body.autoAcceptHours);
        if (hours === 'invalid') return invalid(AUTO_ACCEPT_HOURS_ERROR);
        next.autoAcceptHours = hours;
      }
      if (body.prepMinutes !== undefined) {
        const p = body.prepMinutes;
        if (!p || typeof p !== 'object' || Array.isArray(p)) return invalid(PREP_SETTING_ERROR);
        for (const [mode, minutes] of Object.entries(p)) {
          if (
            !(FULFILMENT_MODES as readonly string[]).includes(mode) ||
            typeof minutes !== 'number' ||
            !Number.isInteger(minutes) ||
            minutes < PREP_SETTING_MIN ||
            minutes > PREP_SETTING_MAX
          ) {
            return invalid(PREP_SETTING_ERROR);
          }
          next.prepMinutes[mode as FulfilmentMode] = minutes;
        }
      }
      if (body.lastOrdersMinutes !== undefined) {
        const v = body.lastOrdersMinutes;
        if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > LAST_ORDERS_MAX)) {
          return invalid(LAST_ORDERS_ERROR);
        }
        next.lastOrdersMinutes = v;
      }
      if (body.busyExtraMinutes !== undefined) {
        const v = body.busyExtraMinutes;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < BUSY_MINUTES_MIN || v > BUSY_MINUTES_MAX) {
          return invalid(BUSY_MINUTES_ERROR);
        }
        next.busyExtraMinutes = v;
      }
      if (body.delivery !== undefined) {
        if (typeof body.delivery !== 'boolean') return invalid(DELIVERY_ERROR);
        next.delivery = body.delivery;
      }
      if (body.deliveryHours !== undefined) {
        const hours = parseWeeklyHours(body.deliveryHours);
        if (hours === 'invalid') return invalid(DELIVERY_HOURS_ERROR);
        next.deliveryHours = hours;
      }
      if (body.deliveryZones !== undefined) {
        const zones = parseDeliveryZones(body.deliveryZones, shop.countryCode ?? '');
        if (zones === 'invalid') return invalid(DELIVERY_ZONES_ERROR);
        next.deliveryZones = zones;
      }
      if (body.deliveryFeeTaxClassId !== undefined) {
        const v = body.deliveryFeeTaxClassId;
        if (v !== null) {
          if (typeof v !== 'string') return invalid(DELIVERY_FEE_TAX_CLASS_ERROR);
          const refs = await getReferenceLists(shop.countryCode ?? '');
          if (!refs.taxClasses.some((c) => c.id === v && c.isActive)) return invalid(DELIVERY_FEE_TAX_CLASS_ERROR);
        }
        next.deliveryFeeTaxClassId = v as string | null;
      }
      if (body.scheduledOrders !== undefined) {
        if (typeof body.scheduledOrders !== 'boolean') return invalid(SCHEDULED_ORDERS_ERROR);
        next.scheduledOrders = body.scheduledOrders;
      }
      if (body.slotCapacity !== undefined) {
        const v = parseSlotCapacity(body.slotCapacity);
        if (v === 'invalid') return invalid(SLOT_CAPACITY_ERROR);
        next.slotCapacity = v;
      }

      return { ok: 'merged', before, next };
    };

    // Another save (or a busy-mode tap) can land between our read and write; on a clash re-read and re-apply the same body.
    let found = initial;
    let merged: { before: OrderSettings; next: OrderSettings } | null = null;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS && !merged; attempt++) {
      if (attempt > 0) {
        const reread = await findShopWithEtag(input.shopId);
        if (!reread || reread.shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
        found = reread;
      }
      const result = await applyBody(found.shop);
      if (result.ok !== 'merged') return result as ApplicationResult<OrderSettingsResultDto>;
      const written = await replaceShopIfMatch(
        { ...found.shop, orderSettings: result.next, updatedAt: (input.now ?? new Date()).toISOString() },
        found.etag,
      );
      if (written === 'ok') merged = result;
    }
    if (!merged) return { ok: false, code: 'CONFLICT', error: SETTINGS_CONFLICT_ERROR };
    const { before, next } = merged;
    const shop = found.shop;

    const changed = (f: keyof OrderSettings): boolean => JSON.stringify(before[f]) !== JSON.stringify(next[f]);
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    for (const f of ['autoRejectMinutes', 'autoAccept', 'dineIn', 'lastOrdersMinutes', 'busyExtraMinutes', 'delivery', 'deliveryFeeTaxClassId', 'scheduledOrders', 'slotCapacity'] as const) {
      if (changed(f)) changes.push({ field: f, from: before[f], to: next[f] });
    }
    // The address itself is never written to the audit log (spec §11).
    if (changed('alertEmail')) changes.push({ field: 'alertEmail', from: null, to: null });
    if (changed('autoAcceptHours')) {
      changes.push({
        field: 'autoAcceptHours',
        from: describeWeeklyHours(before.autoAcceptHours),
        to: describeWeeklyHours(next.autoAcceptHours),
      });
    }
    if (changed('prepMinutes')) {
      changes.push({
        field: 'prepMinutes',
        from: describePrepMinutes(before.prepMinutes),
        to: describePrepMinutes(next.prepMinutes),
      });
    }
    if (changed('deliveryZones')) {
      changes.push({
        field: 'deliveryZones',
        from: describeDeliveryZones(before.deliveryZones),
        to: describeDeliveryZones(next.deliveryZones),
      });
    }
    if (changed('deliveryHours')) {
      changes.push({
        field: 'deliveryHours',
        from: before.deliveryHours === null ? 'opening hours' : describeWeeklyHours(before.deliveryHours),
        to: next.deliveryHours === null ? 'opening hours' : describeWeeklyHours(next.deliveryHours),
      });
    }
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.order_settings_update',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes,
    });
    return { ok: true, data: next };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update order settings' };
  }
}
