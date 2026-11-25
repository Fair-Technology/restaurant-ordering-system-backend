import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeListOwners } from '../../../application/user/listOwners/executeListOwners';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('listOwners', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/owners',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const search = request.query.get('search');
      const page = request.query.get('page');
      const pageSize = request.query.get('pageSize');
      const result = await executeListOwners(
        {
          search: search ?? undefined,
          page: page ? parseInt(page, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('listOwners', error);
    }
  },
});
