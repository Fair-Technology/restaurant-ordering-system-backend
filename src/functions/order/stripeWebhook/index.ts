import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import Stripe from 'stripe';
import { executeHandleBillingSubscriptionEvent } from '../../../application/subscription/handleBillingSubscriptionEvent/executeHandleBillingSubscriptionEvent';
import { invoiceSubscriptionId, subscriptionPeriod, subscriptionPriceId } from '../../../infrastructure/stripe/billingEventParsing';
import { executeHandleCheckoutSessionCompleted } from '../../../application/subscription/handleCheckoutSessionCompleted/executeHandleCheckoutSessionCompleted';

app.http('stripeWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'webhooks/stripe',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      return {
        status: 500,
        jsonBody: { error: 'Stripe is not configured' },
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    // Read raw bytes — must NOT use request.json() as it breaks Stripe signature verification
    const rawBody = Buffer.from(await request.arrayBuffer());
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
      return { status: 400, jsonBody: { error: 'Missing Stripe-Signature header' } };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      return { status: 400, jsonBody: { error: `Webhook Error: ${err.message}` } };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { shopId, planId, billingInterval } = session.metadata ?? {};
          if (!shopId || !planId || session.mode !== 'subscription') break;
          await executeHandleCheckoutSessionCompleted({
            shopId,
            planId,
            billingInterval: billingInterval as 'monthly' | 'yearly',
            billingSubscriptionId: session.subscription as string,
            billingCustomerId: session.customer as string,
          });
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as any;
          if (sub.id) {
            const period = subscriptionPeriod(sub);
            await executeHandleBillingSubscriptionEvent('subscription.updated', {
              billingSubscriptionId: sub.id,
              stripeStatus: sub.status,
              periodStart: period.start,
              periodEnd: period.end,
              cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
              priceId: subscriptionPriceId(sub),
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          if (sub.id) {
            await executeHandleBillingSubscriptionEvent('subscription.deleted', {
              billingSubscriptionId: sub.id,
            });
          }
          break;
        }
        case 'invoice.payment_failed': {
          const billingSubscriptionId = invoiceSubscriptionId(event.data.object);
          if (billingSubscriptionId) {
            await executeHandleBillingSubscriptionEvent('invoice.payment_failed', { billingSubscriptionId });
          }
          break;
        }
        case 'invoice.paid':
        case 'invoice.payment_succeeded': {
          // The invoice's own period is the previous one on a renewal, so period dates come only from subscription events.
          const billingSubscriptionId = invoiceSubscriptionId(event.data.object);
          if (billingSubscriptionId) {
            await executeHandleBillingSubscriptionEvent('invoice.paid', { billingSubscriptionId });
          }
          break;
        }
        default:
          if (event.type.startsWith('customer.subscription.')) console.warn('[billing:warn] unhandled', event.type);
          // Acknowledge all other events without action
          break;
      }
    } catch (err) {
      return { status: 500, jsonBody: { error: 'Failed to process webhook event' } };
    }

    return { status: 200, jsonBody: { received: true } };
  },
});
