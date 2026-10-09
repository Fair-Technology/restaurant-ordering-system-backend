import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateCombo } from '../../../application/combo/createCombo/executeCreateCombo';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('createCombo', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/combos',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const result = await executeCreateCombo({ shopId: request.params.shopId, body }, request);
      return result.ok ? { status: 201, jsonBody: result.data } : mapResultToHttp(result);
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
