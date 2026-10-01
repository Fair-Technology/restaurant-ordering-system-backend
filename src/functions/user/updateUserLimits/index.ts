import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateUserLimits } from '../../../application/user/updateUserLimits/executeUpdateUserLimits';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updateUserLimits', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'platform/users/{userId}/limits',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const userId = request.params.userId;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await executeUpdateUserLimits(
      userId,
      { maxShops: body.maxShops as number | null },
      request,
    );
    return mapResultToHttp(result);
  },
});
