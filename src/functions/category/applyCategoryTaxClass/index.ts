import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeApplyCategoryTaxClass } from '../../../application/category/applyCategoryTaxClass/executeApplyCategoryTaxClass';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('applyCategoryTaxClass', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}/apply-tax-class',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeApplyCategoryTaxClass(
        { shopId: request.params.shopId, categoryId: request.params.categoryId },
        request,
      );
      return mapResultToHttp(result);
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
