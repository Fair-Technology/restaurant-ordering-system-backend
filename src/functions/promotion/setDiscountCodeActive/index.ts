import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetDiscountCodeActive } from '../../../application/promotion/setDiscountCodeActive/executeSetDiscountCodeActive';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('setDiscountCodeActive', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/discount-codes/{codeId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeSetDiscountCodeActive({ shopId: request.params.shopId, codeId: request.params.codeId, body }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
