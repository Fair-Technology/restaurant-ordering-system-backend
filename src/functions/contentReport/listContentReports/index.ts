import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeListContentReports } from '../../../application/contentReport/listContentReports/executeListContentReports';
import { ContentReportStatus } from '../../../domain/contentReport/ContentReport';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('listContentReports', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/content-reports',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const status = request.query.get('status');
      const page = request.query.get('page');
      const pageSize = request.query.get('pageSize');
      const result = await executeListContentReports(
        {
          status: (status ?? '') as ContentReportStatus | '',
          page: page ? parseInt(page, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('listContentReports', error);
    }
  },
});
