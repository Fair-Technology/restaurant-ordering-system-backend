import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import Stripe from 'stripe';
import { deleteCheckoutSession } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { executeHandlePaymentSucceeded } from '../../../application/order/handlePaymentSucceeded/executeHandlePaymentSucceeded';
import {
  findShopByStripeConnectAccountId,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';

app.http('stripeConnectWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'webhooks/stripe-connect',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      return {
        status: 500,
        jsonBody: { error: 'Stripe Connect webhook is not configured' },
      };
    }

    const stripe = new Stripe(stripeSecretKey);

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
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const { sessionId } = pi.metadata;
          if (!sessionId) break;
          await executeHandlePaymentSucceeded({ sessionId, paymentIntentId: pi.id });
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const { sessionId } = pi.metadata;
          if (sessionId) await deleteCheckoutSession(sessionId);
          break;
        }
        case 'account.updated': {
          const account = event.data.object as Stripe.Account;
          const shop = await findShopByStripeConnectAccountId(account.id);
          if (!shop) break;
          const newStatus =
            account.charges_enabled && account.details_submitted
              ? 'complete'
              : account.details_submitted
                ? 'pending'
                : 'not_started';
          if (newStatus !== shop.stripe?.connectOnboardingStatus) {
            await updateShop({
              ...shop,
              stripe: { ...shop.stripe, connectOnboardingStatus: newStatus },
              updatedAt: new Date().toISOString(),
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      return { status: 500, jsonBody: { error: 'Failed to process webhook event' } };
    }

    return { status: 200, jsonBody: { received: true } };
  },
});
