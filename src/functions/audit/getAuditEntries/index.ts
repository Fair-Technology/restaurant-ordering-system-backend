import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetAuditEntries } from '../../../application/audit/getAuditEntries/executeGetAuditEntries';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getAuditEntries', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/audit',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params['shopId'];
      const page = request.query.get('page');
      const pageSize = request.query.get('pageSize');

      const result = await executeGetAuditEntries(
        {
          shopId,
          page: page ? parseInt(page, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        },
        request,
      );

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getAuditEntries', error);
    }
  },
});
