import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateDiscountCode } from '../../../application/promotion/createDiscountCode/executeCreateDiscountCode';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('createDiscountCode', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/discount-codes',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const result = await executeCreateDiscountCode({ shopId: request.params.shopId, body }, request);
      return result.ok ? { status: 201, jsonBody: result.data } : mapResultToHttp(result);
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
