import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetCategoryComboOrder } from '../../../application/combo/setCategoryComboOrder/executeSetCategoryComboOrder';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('setCategoryComboOrder', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}/combo-order',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { shopId, categoryId } = request.params;
      const body = (await request.json()) as any;
      const result = await executeSetCategoryComboOrder({ shopId, categoryId, productIds: body?.productIds }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('setCategoryComboOrder', error);
    }
  },
});
