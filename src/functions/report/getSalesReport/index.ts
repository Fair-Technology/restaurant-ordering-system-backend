import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetSalesReport } from '../../../application/report/getSalesReport/executeGetSalesReport';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getSalesReport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/reports/sales',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(
        await executeGetSalesReport(
          { shopId: request.params.shopId, from: request.query.get('from'), to: request.query.get('to') },
          request,
        ),
      );
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
