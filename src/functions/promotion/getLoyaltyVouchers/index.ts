import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetLoyaltyVouchers } from '../../../application/promotion/getLoyaltyVouchers/executeGetLoyaltyVouchers';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getLoyaltyVouchers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/loyalty-vouchers',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const pageParam = request.query.get('page');
      const pageSizeParam = request.query.get('pageSize');
      const result = await executeGetLoyaltyVouchers(
        {
          shopId: request.params.shopId,
          page: pageParam ? Number(pageParam) : undefined,
          pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
        },
        request,
      );
      return result.ok ? { status: 200, jsonBody: result.data } : mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getLoyaltyVouchers', error);
    }
  },
});
