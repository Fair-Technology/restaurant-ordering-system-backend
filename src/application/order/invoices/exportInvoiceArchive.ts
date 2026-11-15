import type { HttpRequest } from '@azure/functions';
import { invoiceFileName } from '../../../domain/invoice/invoice';
import { isMonthKey, monthRangeUtc } from '../../../domain/invoice/monthRange';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findInvoiceDocumentsIssuedBetween } from '../../../infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { renderInvoicePdf } from '../../../infrastructure/pdf/invoicePdf';
import { buildStoreZip, type ZipEntry } from '../../../infrastructure/zip/storeZip';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import type { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { OWNER_ONLY_ERROR } from '../../legal/acceptDpa/executeAcceptDpa';

export interface InvoiceArchiveFileDto {
  fileName: string;
  contentType: 'application/zip';
  contentBase64: string;
}

export const EMPTY_MONTH_ERROR = 'No invoices or correction invoices were issued in that month';

/**
 * The owner downloads a month's invoices and correction invoices as one ZIP of PDFs. The month is the
 * restaurant's local month and is matched on the *document* date, so a November correction for an October
 * order lands in November's batch. Nothing is stored: each PDF is rendered from its snapshot, like a single download.
 */
export async function executeExportInvoiceArchive(
  input: { shopId: string; month: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<InvoiceArchiveFileDto>> {
  if (!input.shopId || input.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  if (typeof input.month !== 'string' || !isMonthKey(input.month)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'month must be in the form YYYY-MM, e.g. 2026-10' };
  }

  try {
    const shop = await findShopById(input.shopId.trim());
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }
    const access = await authorizeShopAction(httpRequest, shop, null);
    if (!access.ok) return access;
    if (access.actor.actorType !== 'owner') {
      return { ok: false, code: 'FORBIDDEN', error: OWNER_ONLY_ERROR };
    }

    const { fromIso, toIso } = monthRangeUtc(input.month, shop.timezone);
    const docs = (await findInvoiceDocumentsIssuedBetween(shop.id, fromIso, toIso))
      .filter((d) => d.issuedAt >= fromIso && d.issuedAt < toIso)
      .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.number.localeCompare(b.number));
    if (docs.length === 0) {
      return { ok: false, code: 'NOT_FOUND', error: EMPTY_MONTH_ERROR };
    }

    const entries: ZipEntry[] = [];
    for (const doc of docs) {
      entries.push({
        name: invoiceFileName(doc),
        data: await renderInvoicePdf(doc),
        modifiedAt: new Date(doc.issuedAt),
      });
    }
    const zip = buildStoreZip(entries);

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.invoice_archive',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
    });

    return {
      ok: true,
      data: {
        fileName: `invoices-${input.month}.zip`,
        contentType: 'application/zip',
        contentBase64: Buffer.from(zip).toString('base64'),
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('exportInvoiceArchive', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to export invoices' };
  }
}
