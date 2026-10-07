import { HttpRequest } from '@azure/functions';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { isStripeCardError } from '../../../infrastructure/stripe/billingEventParsing';
import { applyBillingEvent } from '../../../domain/subscription/billingEvents';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';
import { PAYMENT_DECLINED_AGAIN_ERROR } from '../../../domain/order/orderErrors';
import { toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { GetShopSubscriptionResultDto } from '../getShopSubscription/dtos';
import { loadShopSubscriptionResult } from '../getShopSubscription/executeGetShopSubscription';
import { authorizeBilling, isApplicationError, stripeFromEnv } from '../_shared/billingAccess';

/** "Pay now": tries the open invoice again with whatever card is on file. */
export async function executeRetrySubscriptionPayment(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const access = await authorizeBilling(shopId, httpRequest);
    if (!access.ok) return access;

    const sub = await findSubscriptionByShopId(shopId);
    if (!sub?.billingSubscriptionId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Nothing to pay' };
    }

    const stripe = stripeFromEnv();
    if (isApplicationError(stripe)) return stripe;

    const stripeSubscription = await stripe.subscriptions.retrieve(sub.billingSubscriptionId, { expand: ['latest_invoice'] });
    const invoice = stripeSubscription.latest_invoice;
    if (!invoice || typeof invoice === 'string' || invoice.status !== 'open' || !invoice.id) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Nothing to pay' };
    }

    try {
      await stripe.invoices.pay(invoice.id);
    } catch (err) {
      if (isStripeCardError(err)) return { ok: false, code: 'CONFLICT', error: PAYMENT_DECLINED_AGAIN_ERROR };
      throw err;
    }

    const defaultPlan = await findDefaultPlan();
    await upsertSubscription(
      applyBillingEvent(sub, { kind: 'invoice.paid' }, { defaultPlanId: defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now: new Date() }),
    );
    await logAudit({
      ...toAuditActor(access.actor),
      action: 'subscription.payment_retried',
      entityType: 'subscription',
      entityId: sub.id,
      entityName: `Shop ${shopId}`,
      shopId,
      changes: [],
    });

    return { ok: true, data: await loadShopSubscriptionResult(shopId) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to take the payment' };
  }
}
