import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOrdersByShop } from '../../../application/order/getOrdersByShop/executeGetOrdersByShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOrdersByShop', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/orders',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const pageParam = request.query.get('page');
      const pageSizeParam = request.query.get('pageSize');
      const result = await executeGetOrdersByShop(
        {
          shopId,
          page: pageParam ? Number(pageParam) : undefined,
          pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
        },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getOrdersByShop', error);
    }
  },
});
