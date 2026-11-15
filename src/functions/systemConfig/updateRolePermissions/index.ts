import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateRolePermissions } from '../../../application/systemConfig/updateRolePermissions/executeUpdateRolePermissions';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateRolePermissions', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'platform/role-permissions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeUpdateRolePermissions(
        { manager: body.manager as any, staff: body.staff as any },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateRolePermissions', error);
    }
  },
});
