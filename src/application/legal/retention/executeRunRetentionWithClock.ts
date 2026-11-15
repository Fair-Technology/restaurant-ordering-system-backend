import { HttpRequest } from '@azure/functions';
import { authenticate } from '../../../infrastructure/auth/principal';
import { isSuperAdminPrincipal } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { RetentionResult, runRetention } from './runRetention';

export interface RunRetentionWithClockRequestDto {
  /** ISO timestamp the sweep runs "as of". */
  now: unknown;
  /** Optional: restrict the sweep to one shop. Omitted, every shop is swept. */
  shopId?: unknown;
}

/**
 * Superadmin (platform write) only. Runs the retention sweep `run_retention` with a supplied clock,
 * so the window can be fired in dev without waiting real days. On the shared dev database an
 * optional `shopId` scopes the run to one shop. The HTTP layer hides this entirely unless test-clock
 * routes are enabled (see testClockRoutes.ts).
 */
export async function executeRunRetentionWithClock(
  request: RunRetentionWithClockRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RetentionResult>> {
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

  if (typeof request.now !== 'string' || Number.isNaN(Date.parse(request.now))) {
    return { ok: false, code: 'INVALID_INPUT', error: 'now must be an ISO date-time string' };
  }
  let shopId: string | undefined;
  if (request.shopId !== undefined) {
    if (typeof request.shopId !== 'string' || request.shopId.trim() === '') {
      return { ok: false, code: 'INVALID_INPUT', error: 'shopId must be a non-empty string when supplied' };
    }
    shopId = request.shopId.trim();
  }

  try {
    const data = await runRetention({ now: new Date(request.now), onlyShopIds: shopId ? [shopId] : undefined });
    console.log(
      `[retention] action=run.injectedClock adminId=${adminId} now=${new Date(request.now).toISOString()} shopId=${shopId ?? 'all'} blanked=${data.blanked}`,
    );
    return { ok: true, data };
  } catch (error) {
    logServiceFailure('runRetentionWithClock', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to run the retention sweep' };
  }
}
