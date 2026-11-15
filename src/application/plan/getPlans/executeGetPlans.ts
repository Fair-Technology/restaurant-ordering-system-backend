import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { findAllPlans, findVisiblePlans } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPlansResultDto } from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

/**
 * Lists plans for two audiences:
 * - customers (default): any authenticated caller gets the visible plans only.
 * - platform operators (`includeHidden`): Platform.Owner/Support/ReadOnly get every plan,
 *   including those hidden from the customer selector. Anyone else gets FORBIDDEN.
 */
export async function executeGetPlans(
  httpRequest: HttpRequest,
  options: { includeHidden?: boolean } = {},
): Promise<ApplicationResult<GetPlansResultDto>> {
  try {
    if (options.includeHidden) {
      // Operator view: hidden plans included, so an operator can find, price and
      // assign any plan. isVisible governs the CUSTOMER selector, never what an
      // operator may administer. Read level (Platform.Owner/Support/ReadOnly).
      const adminId = await requirePlatform(httpRequest, 'read');
      if (!adminId) {
        return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
      }
      const plans = await findAllPlans();
      return { ok: true, data: { plans } };
    }

    // Customer/default view: authenticated, visible-only.
    await getUserIdFromAuth(httpRequest);
    const plans = await findVisiblePlans();
    return { ok: true, data: { plans } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getPlans', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve plans' };
  }
}
