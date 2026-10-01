import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeExportShopData } from '../../../application/legal/exportShopData/executeExportShopData';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('exportShopData', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/data-export',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeExportShopData({ shopId: request.params.shopId }, request);
    return mapResultToHttp(result);
  },
});
