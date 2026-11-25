import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetCategoryDishOrder } from '../../../application/product/setCategoryDishOrder/executeSetCategoryDishOrder';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('setCategoryDishOrder', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}/dish-order',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { shopId, categoryId } = request.params;
      const body = (await request.json()) as any;
      const result = await executeSetCategoryDishOrder({ shopId, categoryId, productIds: body?.productIds }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('setCategoryDishOrder', error);
    }
  },
});
