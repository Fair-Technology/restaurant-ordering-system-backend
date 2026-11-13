import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateCombo } from '../../../application/combo/updateCombo/executeUpdateCombo';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateCombo', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/combos/{comboId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const result = await executeUpdateCombo(
        { shopId: request.params.shopId, comboId: request.params.comboId, body },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateCombo', error);
    }
  },
});
