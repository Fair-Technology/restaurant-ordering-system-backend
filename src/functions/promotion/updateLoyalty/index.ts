import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateLoyalty } from '../../../application/promotion/updateLoyalty/executeUpdateLoyalty';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('updateLoyalty', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/loyalty',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeUpdateLoyalty({ shopId: request.params.shopId, body }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
