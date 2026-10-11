import { HttpRequest } from '@azure/functions';
import Stripe from 'stripe';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { countOpenOrdersByShopId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { applyBillingEvent } from '../../../domain/subscription/billingEvents';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { logAudit } from '../../_shared/auditHelpers';
import { DeleteShopRequestDto, DeleteShopResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export const DELETE_OWNER_ONLY_ERROR = 'Only the restaurant owner can delete it';
export const OPEN_ORDERS_ERROR =
  'This restaurant still has orders in progress. Finish or refund them first, then delete the restaurant.';

export async function executeDeleteShop(
  request: DeleteShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteShopResultDto>> {
  // Validate input
  if (
    !request.shopId ||
    typeof request.shopId !== 'string' ||
    request.shopId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  try {
    const shop = await findShopById(request.shopId.trim());

    if (!shop || shop.isDeleted) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    // Owner (or superadmin) only: managers and staff hold manage_shop but may not delete.
    const access = await authorizeShopAction(httpRequest, shop, null, { allowSuperadmin: true });
    if (!access.ok) return access;
    if (access.actor.actorType === 'staff') {
      return { ok: false, code: 'FORBIDDEN', error: DELETE_OWNER_ONLY_ERROR };
    }

    if ((await countOpenOrdersByShopId(shop.id)) > 0) {
      return { ok: false, code: 'OPEN_ORDERS', error: OPEN_ORDERS_ERROR };
    }

    // Stop billing right now (not at period end). If Stripe fails, nothing is deleted.
    const subscription = await findSubscriptionByShopId(shop.id);
    if (subscription?.billingSubscriptionId) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return { ok: false, code: 'INTERNAL_ERROR', error: 'Stripe is not configured' };
      }
      try {
        await new Stripe(stripeSecretKey).subscriptions.cancel(subscription.billingSubscriptionId);
      } catch (err: any) {
        // Already gone on Stripe's side is the state we want; anything else aborts the delete.
        if (err?.code !== 'resource_missing') {
          return { ok: false, code: 'INTERNAL_ERROR', error: 'Could not cancel the subscription, so the restaurant was not deleted' };
        }
      }
      // Same fold the "subscription deleted" webhook applies, so both paths leave the same record.
      const defaultPlan = await findDefaultPlan();
      await upsertSubscription(
        applyBillingEvent(
          subscription,
          { kind: 'subscription.deleted' },
          { defaultPlanId: defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now: new Date() },
        ),
      );
    }

    const now = new Date().toISOString();
    await updateShop({
      ...shop,
      isDeleted: true,
      deletedAt: now,
      deletedBy: access.actor.actorId,
      updatedAt: now,
    });

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.delete',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [{ field: 'isDeleted', from: false, to: true }],
    });

    return {
      ok: true,
      data: { success: true },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to delete shop',
    };
  }
}
