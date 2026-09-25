import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateRolePermissions } from '../../../application/systemConfig/updateRolePermissions/executeUpdateRolePermissions';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updateRolePermissions', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'admin/role-permissions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await executeUpdateRolePermissions(
      { manager: body.manager as any, staff: body.staff as any },
      request,
    );
    return mapResultToHttp(result);
  },
});
