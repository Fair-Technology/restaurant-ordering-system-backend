import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateCombo } from '../../../application/combo/createCombo/executeCreateCombo';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { COMBO_IMAGE_REQUIRED_TO_ENABLE } from '../../../domain/product/combo';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createCombo', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/combos',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const result = await executeCreateCombo({ shopId: request.params.shopId, body }, request);
      if (result.ok) return { status: 201, jsonBody: result.data };
      if (result.code === COMBO_IMAGE_REQUIRED_TO_ENABLE) {
        return { status: 400, jsonBody: { error: result.error, code: result.code } };
      }
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createCombo', error);
    }
  },
});
