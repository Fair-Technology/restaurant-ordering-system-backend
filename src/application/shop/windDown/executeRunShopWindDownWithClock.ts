import { HttpRequest } from '@azure/functions';
import { authenticate } from '../../../infrastructure/auth/principal';
import { isSuperAdminPrincipal } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { executeWindDownShops, WindDownResult } from './executeWindDownShops';

export interface RunShopWindDownWithClockRequestDto {
  shopId: string;
  /** ISO timestamp the wind-down runs "as of". */
  now: unknown;
}

/**
 * Superadmin (platform write) only. Runs the daily wind-down for ONE shop with a supplied clock, so
 * the day-90 behaviour can be observed in dev without waiting 90 days. Scoped to a single shop on
 * purpose: on the shared dev database a far-future clock would otherwise wind down every deleted shop.
 * The HTTP layer hides this entirely unless test-clock routes are enabled (see testClockRoutes.ts).
 */
export async function executeRunShopWindDownWithClock(
  request: RunShopWindDownWithClockRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<WindDownResult>> {
  let principal;
  try {
    principal = await authenticate(httpRequest);
  } catch {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Authentication required' };
  }
  if (!(await isSuperAdminPrincipal(principal))) {
    return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
  }
  const adminId = principal.kind === 'entra' ? principal.userId : '';

  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  if (typeof request.now !== 'string' || Number.isNaN(Date.parse(request.now))) {
    return { ok: false, code: 'INVALID_INPUT', error: 'now must be an ISO date-time string' };
  }

  try {
    const data = await executeWindDownShops({
      now: new Date(request.now),
      onlyShopIds: [request.shopId.trim()],
      actor: { actorType: 'superadmin', actorId: adminId },
    });
    console.log(
      `[windDown] action=run.injectedClock adminId=${adminId} shopId=${request.shopId.trim()} now=${new Date(request.now).toISOString()}`,
    );
    return { ok: true, data };
  } catch (error) {
    logServiceFailure('runShopWindDownWithClock', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to run the wind-down' };
  }
}
