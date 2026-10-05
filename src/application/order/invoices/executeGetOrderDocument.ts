import type { HttpRequest } from '@azure/functions';
import { invoiceFileName } from '../../../domain/invoice/invoice';
import { DOCUMENT_NOT_FOUND_ERROR, ORDER_NOT_FOUND_ERROR } from '../../../domain/order/orderErrors';
import { accessTokenMatches } from '../../../domain/order/orderIds';
import { findInvoiceById } from '../../../infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { renderInvoicePdf } from '../../../infrastructure/pdf/invoicePdf';
import { loadShopForOrderAction } from '../intake/loadShopForOrderAction';
import type { ApplicationResult } from '../../_shared/types';

export interface InvoiceFileDto {
  fileName: string;
  contentType: 'application/pdf';
  contentBase64: string;
}

/** A document belongs to an order when it is the invoice (the order's id) or one of its corrections (`<orderId>-c<n>`). */
function belongsToOrder(orderId: string, documentId: string): boolean {
  return documentId === orderId || documentId.startsWith(`${orderId}-c`);
}

async function renderDocument(shopId: string, documentId: string): Promise<ApplicationResult<InvoiceFileDto>> {
  const doc = await findInvoiceById(shopId, documentId);
  if (!doc) return { ok: false, code: 'NOT_FOUND', error: DOCUMENT_NOT_FOUND_ERROR };
  const pdf = await renderInvoicePdf(doc);
  return {
    ok: true,
    data: {
      fileName: invoiceFileName(doc),
      contentType: 'application/pdf',
      contentBase64: Buffer.from(pdf).toString('base64'),
    },
  };
}

/** Restaurant staff download an invoice or correction of an order of their own shop. */
export async function executeGetOrderDocument(
  request: { shopId: string; orderId: string; documentId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<InvoiceFileDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    if (!belongsToOrder(request.orderId, request.documentId)) {
      return { ok: false, code: 'NOT_FOUND', error: DOCUMENT_NOT_FOUND_ERROR };
    }
    const order = await findOrderById(request.orderId);
    if (!order || order.shopId !== loaded.shop.id) {
      return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
    }
    return await renderDocument(loaded.shop.id, request.documentId);
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve document' };
  }
}

/** The diner downloads a document of their order with the secret link token. A wrong token looks like a missing order. */
export async function executeGetCustomerDocument(request: {
  orderId: string;
  documentId: string;
  token: unknown;
}): Promise<ApplicationResult<InvoiceFileDto>> {
  try {
    if (!request.orderId || !belongsToOrder(request.orderId, request.documentId)) {
      return { ok: false, code: 'NOT_FOUND', error: DOCUMENT_NOT_FOUND_ERROR };
    }
    const order = await findOrderById(request.orderId);
    if (!order || !accessTokenMatches(order.customerAccessToken, request.token)) {
      return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
    }
    return await renderDocument(order.shopId, request.documentId);
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve document' };
  }
}
