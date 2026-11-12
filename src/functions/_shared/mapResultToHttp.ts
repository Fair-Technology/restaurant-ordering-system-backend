import { HttpResponseInit } from '@azure/functions';
import { errorBrief } from '../../application/_shared/errorBrief';

export interface ApplicationError {
  ok: false;
  code: string;
  error: string;
}

export interface ApplicationSuccess<T = any> {
  ok: true;
  data: T;
}

export type ApplicationResult<T = any> = ApplicationSuccess<T> | ApplicationError;

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
        jsonBody: { error: result.error }
      };
    case 'NOT_FOUND':
      return {
        status: 404,
        jsonBody: { error: result.error }
      };
    case 'FORBIDDEN':
      return {
        status: 403,
        jsonBody: { error: result.error }
      };
    case 'CONFLICT':
      return {
        status: 409,
        jsonBody: { error: result.error }
      };
    case 'OPEN_ORDERS':
      return {
        status: 409,
        jsonBody: { error: result.error, code: 'OPEN_ORDERS' }
      };
    case 'SHOP_OFFLINE_BY_SUPERADMIN':
    case 'ORDERS_PAUSED':
    case 'TAX_RATE_MISSING':
      return {
        status: 409,
        jsonBody: { error: result.error, code: result.code }
      };
    case 'PRODUCT_IMAGE_REQUIRED':
      return {
        status: 409,
        jsonBody: { error: result.error, code: 'PRODUCT_IMAGE_REQUIRED' }
      };
    case 'COVER_IMAGE_WRONG_SIZE':
    case 'PRODUCT_IMAGE_WRONG_SIZE':
      return {
        status: 400,
        jsonBody: { error: result.error, code: result.code }
      };
    case 'LIMIT_REACHED':
      return {
        status: 422,
        jsonBody: { error: result.error }
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
