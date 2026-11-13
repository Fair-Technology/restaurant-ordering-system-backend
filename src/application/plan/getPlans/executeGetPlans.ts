import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findVisiblePlans } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPlansResultDto } from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeGetPlans(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetPlansResultDto>> {
  try {
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
