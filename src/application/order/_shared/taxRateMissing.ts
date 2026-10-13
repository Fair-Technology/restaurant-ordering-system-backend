import { TAX_RATE_MISSING_ERROR } from '../../../domain/order/orderErrors';
import type { TaxRateMissingError } from '../../../domain/reference/ReferenceLists';
import type { ApplicationError } from '../../_shared/types';

/** A tax class has no rate in effect: refuse the sale and leave a log line so the gap gets fixed. */
export function taxRateMissingResult(shopId: string, error: TaxRateMissingError): ApplicationError {
  console.error('[tax:missing-rate]', shopId, error.taxClassId, error.mode, error.at.toISOString());
  return { ok: false, code: 'TAX_RATE_MISSING', error: TAX_RATE_MISSING_ERROR };
}
