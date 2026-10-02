import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateOrderSettings } from '../../../application/shop/updateOrderSettings/executeUpdateOrderSettings';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('updateOrderSettings', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/order-settings',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeUpdateOrderSettings({ shopId: request.params.shopId, body }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
