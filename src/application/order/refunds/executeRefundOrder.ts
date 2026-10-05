import type { HttpRequest } from '@azure/functions';
import { randomUUID } from 'node:crypto';
import { invoiceFileName, invoiceTitle } from '../../../domain/invoice/invoice';
import type { Order, RefundLine } from '../../../domain/order/Order';
import {
  REFUND_AMOUNT_ERROR,
  REFUND_FAILED_PREFIX,
  REFUND_MODE_ERROR,
  REFUND_RATE_EXCEEDED_ERROR,
  REFUND_REASON_ERROR,
  REFUND_STATE_ERROR,
} from '../../../domain/order/orderErrors';
import { buildTaxBreakdown } from '../../../domain/order/tax';
import {
  isCaptured,
  MANUAL_REFUND_STATES,
  paymentStatusAfterRefund,
  refundedCents,
  validateRefundAmount,
} from '../../../domain/order/payment';
import { baseByRate, buildItemRefundLines, remainingByRate } from '../../../domain/order/refundAllocation';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findOrderWithEtag } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import type { EmailAttachment } from '../../../infrastructure/email/emailSender';
import { renderInvoicePdf } from '../../../infrastructure/pdf/invoicePdf';
import { createRefund } from '../../../infrastructure/stripe/stripeClient';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import type { ApplicationResult } from '../../_shared/types';
import type { OrderDto } from '../getOrdersByShop/dtos';
import { issueCorrectionForRefund } from '../invoices/issueInvoice';
import { notifyCustomer } from '../notifications/notifyOrder';
import type { AttachedDocument } from '../notifications/emailTemplates';
import { toOrderDto } from '../_shared/toOrderDto';
import { shopActorToOrderActor, transitionOrder } from '../_shared/transitionOrder';
import type { RefundOrderBody } from './dtos';

const MAX_REASON_CHARS = 200;
const WRITE_ATTEMPTS = 3;

/**
 * Gives part or all of the money of an accepted, ready or completed card order back. Either ticked items
 * (refunded at their own VAT rate) or a free amount. Stripe is asked first, then the refund is recorded,
 * then a correction invoice is issued and emailed with the refund email.
 */
export async function executeRefundOrder(
  request: { shopId: string; orderId: string } & Partial<RefundOrderBody>,
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderDto>> {
  try {
    const now = options.now ?? new Date();
    const shop = request.shopId ? await findShopById(request.shopId) : null;
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    const access = await authorizeShopAction(httpRequest, shop, 'refund_orders');
    if (!access.ok) return access;

    const reason = typeof request.reason === 'string' ? request.reason.trim() : '';
    if (reason.length < 1 || reason.length > MAX_REASON_CHARS) {
      return { ok: false, code: 'INVALID_INPUT', error: REFUND_REASON_ERROR };
    }
    const hasItems = request.items !== undefined;
    const hasAmount = request.amountCents !== undefined;
    if (hasItems === hasAmount) return { ok: false, code: 'INVALID_INPUT', error: REFUND_MODE_ERROR };

    const found = await findOrderWithEtag(request.orderId);
    if (!found || found.order.shopId !== shop.id) return { ok: false, code: 'NOT_FOUND', error: 'Order not found' };
    const o = found.order;
    if (!MANUAL_REFUND_STATES.includes(o.state) || !isCaptured(o) || o.payment.status === 'refunded') {
      return { ok: false, code: 'CONFLICT', error: REFUND_STATE_ERROR };
    }

    const prior = (o.refunds ?? []).map((r) => ({ amountCents: r.amountCents, lines: r.lines }));
    const base = baseByRate(o.taxBreakdown ?? buildTaxBreakdown(o.items));

    let amount: number;
    let lines: RefundLine[] | undefined;
    if (hasItems) {
      const built = buildItemRefundLines(o.items, prior, request.items);
      if (typeof built === 'string') return { ok: false, code: 'INVALID_INPUT', error: built };
      amount = built.reduce((sum, l) => sum + l.grossCents, 0);
      if (validateRefundAmount(o, amount)) return { ok: false, code: 'INVALID_INPUT', error: REFUND_AMOUNT_ERROR };
      const left = remainingByRate(base, prior);
      for (const l of built) {
        const atRate = built.filter((x) => x.taxRateBasisPoints === l.taxRateBasisPoints);
        const wanted = atRate.reduce((sum, x) => sum + x.grossCents, 0);
        const available = left.find((r) => r.rateBasisPoints === l.taxRateBasisPoints)?.grossCents ?? 0;
        if (wanted > available) return { ok: false, code: 'INVALID_INPUT', error: REFUND_RATE_EXCEEDED_ERROR };
      }
      lines = built;
    } else {
      if (validateRefundAmount(o, request.amountCents)) {
        return { ok: false, code: 'INVALID_INPUT', error: REFUND_AMOUNT_ERROR };
      }
      amount = request.amountCents as number;
    }

    const connectAccountId = shop.stripe?.connectAccountId;
    const paymentIntentId = o.payment.stripePaymentIntentId;
    if (!connectAccountId || !paymentIntentId) {
      return { ok: false, code: 'INVALID_INPUT', error: `${REFUND_FAILED_PREFIX}Stripe is not connected` };
    }

    // The key names the refund's position and amount, so a double click or retry is the same refund at Stripe.
    let stripeRefundId: string;
    try {
      const refund = await createRefund({
        connectAccountId,
        paymentIntentId,
        amountCents: amount,
        idempotencyKey: `refund-${o.id}-${prior.length}-${amount}`,
      });
      stripeRefundId = refund.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, code: 'INVALID_INPUT', error: `${REFUND_FAILED_PREFIX}${message}` };
    }

    // Stripe has the money moving now, so the record is retried; the same Stripe refund is never added twice.
    let written: Order | null = null;
    let conflict: ApplicationResult<OrderDto> | null = null;
    for (let attempt = 0; attempt < WRITE_ATTEMPTS && !written; attempt++) {
      const moved = await transitionOrder({
        orderId: o.id,
        shopId: shop.id,
        change: (current) => {
          if ((current.refunds ?? []).some((r) => r.stripeRefundId === stripeRefundId)) {
            return { ok: true, order: current };
          }
          return {
            ok: true,
            order: {
              ...current,
              payment: { ...current.payment, status: paymentStatusAfterRefund(current, amount) },
              refunds: [
                ...(current.refunds ?? []),
                {
                  id: randomUUID(),
                  amountCents: amount,
                  reason,
                  at: now.toISOString(),
                  actor: shopActorToOrderActor(access.actor),
                  stripeRefundId,
                  ...(lines ? { lines } : {}),
                },
              ],
              updatedAt: now.toISOString(),
            },
          };
        },
      });
      if (moved.ok) written = moved.order;
      else conflict = moved;
    }
    if (!written) return conflict ?? { ok: false, code: 'CONFLICT', error: REFUND_STATE_ERROR };

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'order.refund',
      entityType: 'order',
      entityId: written.id,
      entityName: written.orderRef,
      changes: [{ field: 'refundedCents', from: refundedCents(o), to: refundedCents(written) }],
    });

    let attachments: EmailAttachment[] | undefined;
    let attachedDocument: AttachedDocument | undefined;
    try {
      const index = (written.refunds ?? []).findIndex((r) => r.stripeRefundId === stripeRefundId);
      const doc = await issueCorrectionForRefund(written, index, shop, now);
      if (doc) {
        const pdf = await renderInvoicePdf(doc);
        attachments = [
          {
            name: invoiceFileName(doc),
            contentType: 'application/pdf',
            contentInBase64: Buffer.from(pdf).toString('base64'),
          },
        ];
        attachedDocument = { title: invoiceTitle(doc.documentType, doc.language), number: doc.number };
      }
    } catch {
      // The timer issues missing corrections later.
      console.error('[invoice:error] could not issue the correction invoice', written.id);
    }

    const latest = (await findOrderWithEtag(written.id))?.order ?? written;
    await notifyCustomer('order_refunded', latest, shop, { attachments, attachedDocument });
    return { ok: true, data: toOrderDto(latest, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to refund order' };
  }
}
