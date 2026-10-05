import type { JSONObject, OperationInput } from '@azure/cosmos';
import type { InvoiceCounterDoc, InvoiceDoc } from '../../../domain/invoice/invoice';
import { invoiceContainer } from '../cosmosClient';

export type CommitInvoiceResult = 'ok' | 'counter_conflict' | 'invoice_exists' | 'number_taken';

export async function findInvoiceCounter(
  shopId: string,
): Promise<{ counter: InvoiceCounterDoc; etag: string } | null> {
  try {
    const { resource, etag } = await invoiceContainer.item('counter', shopId).read<InvoiceCounterDoc>();
    return resource && etag ? { counter: resource, etag } : null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function findInvoiceById(shopId: string, documentId: string): Promise<InvoiceDoc | null> {
  try {
    const { resource } = await invoiceContainer.item(documentId, shopId).read<InvoiceDoc>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/**
 * Writes the counter and the document in one all-or-nothing batch, so a number is never used without
 * the counter moving past it (no gaps) and the unique key on `/number` refuses a number used twice.
 * `counterEtag` null means no counter exists yet (create), otherwise it is replaced only if unchanged.
 */
export async function commitInvoice(
  counter: InvoiceCounterDoc,
  counterEtag: string | null,
  doc: InvoiceDoc,
): Promise<CommitInvoiceResult> {
  const counterOperation: OperationInput =
    counterEtag === null
      ? { operationType: 'Create' as const, resourceBody: counter as unknown as JSONObject }
      : {
          operationType: 'Replace' as const,
          id: counter.id,
          resourceBody: counter as unknown as JSONObject,
          ifMatch: counterEtag,
        };
  const response = await invoiceContainer.items.batch(
    [counterOperation, { operationType: 'Create' as const, resourceBody: doc as unknown as JSONObject }],
    doc.shopId,
  );
  const results = response.result ?? [];
  const counterStatus = results[0]?.statusCode ?? 0;
  const docStatus = results[1]?.statusCode ?? 0;
  if (counterStatus < 400 && docStatus < 400 && results.length === 2) return 'ok';
  if (counterStatus === 409 || counterStatus === 412) return 'counter_conflict';
  if (docStatus === 409) {
    return (await findInvoiceById(doc.shopId, doc.id)) ? 'invoice_exists' : 'number_taken';
  }
  throw new Error(`Invoice batch failed (counter ${counterStatus}, document ${docStatus})`);
}
