import { HttpResponseInit } from '@azure/functions';
import { errorBrief } from '../../application/_shared/errorBrief';

import type { ApplicationError, ApplicationResult } from '../../application/_shared/types';

export type { ApplicationError, ApplicationSuccess, ApplicationResult } from '../../application/_shared/types';

// Stable, machine-readable detail a client can translate. Spread in only when set, so responses
// for calls that never set these fields are unchanged.
function structuredFields(result: ApplicationError) {
  return {
    ...(result.errorCode !== undefined && { errorCode: result.errorCode }),
    ...(result.field !== undefined && { field: result.field }),
    ...(result.max !== undefined && { max: result.max }),
    ...(result.requestedCents !== undefined && { requestedCents: result.requestedCents }),
    ...(result.availableCents !== undefined && { availableCents: result.availableCents }),
    ...(result.minimumCents !== undefined && { minimumCents: result.minimumCents }),
  };
}

export function mapResultToHttp<T>(result: ApplicationResult<T>): HttpResponseInit {
  if (result.ok) {
    return {
      status: 200,
      jsonBody: result.data
    };
  }

  switch (result.code) {
    case 'INVALID_INPUT':
      return {
        status: 400,
        jsonBody: {
          error: result.error,
          ...structuredFields(result),
        },
      };
    case 'NOT_FOUND':
      return {
        status: 404,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    case 'UNAUTHORIZED':
      return {
        status: 401,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    case 'FORBIDDEN':
      return {
        status: 403,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    case 'CONFLICT':
      return {
        status: 409,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    case 'OPEN_ORDERS':
      return {
        status: 409,
        jsonBody: { error: result.error, code: 'OPEN_ORDERS', ...structuredFields(result) }
      };
    case 'SHOP_ADDRESS_LOCKED':
      return {
        status: 403,
        jsonBody: { error: result.error, code: result.code, ...structuredFields(result) }
      };
    case 'SHOP_OFFLINE_BY_SUPERADMIN':
    case 'ORDERS_PAUSED':
    case 'TAX_RATE_MISSING':
      return {
        status: 409,
        jsonBody: { error: result.error, code: result.code, ...structuredFields(result) }
      };
    case 'PRODUCT_IMAGE_REQUIRED':
    case 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE':
    case 'COMBO_IMAGE_REQUIRED_TO_ENABLE':
      return {
        status: 409,
        jsonBody: { error: result.error, code: result.code, ...structuredFields(result) }
      };
    case 'COVER_IMAGE_WRONG_SIZE':
    case 'PRODUCT_IMAGE_WRONG_SIZE':
      return {
        status: 400,
        jsonBody: { error: result.error, code: result.code, ...structuredFields(result) }
      };
    case 'NOT_CONFIGURED':
      return {
        status: 503,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    case 'RATE_LIMITED':
      return {
        status: 429,
        jsonBody: { error: result.error, code: 'RATE_LIMITED', ...structuredFields(result) }
      };
    case 'LIMIT_REACHED':
      return {
        status: 422,
        jsonBody: { error: result.error, ...structuredFields(result) }
      };
    default:
      // Every unmapped code (INTERNAL_ERROR, STRIPE_ERROR, ...) lands here. Log it so a bare 500 is
      // diagnosable; the response is unchanged. Code and message only: no request data.
      console.error(`[http:500] unmapped result code=${result.code} error=${errorBrief(result.error)}`);
      return {
        status: 500,
        jsonBody: { error: 'Internal server error' }
      };
  }
}
