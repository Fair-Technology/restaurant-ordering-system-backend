import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetRolePermissions } from '../../../application/systemConfig/getRolePermissions/executeGetRolePermissions';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getRolePermissions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/role-permissions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetRolePermissions(request);
    return mapResultToHttp(result);
  },
});
