import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateOptionGroup } from '../../../application/optionGroup/updateOptionGroup/executeUpdateOptionGroup';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateOptionGroup', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups/{groupId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const groupId = request.params.groupId;
      const body = ((await request.json().catch(() => ({}))) ?? {}) as any;

      const result = await executeUpdateOptionGroup({ ...body, shopId, groupId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateOptionGroup', error);
    }
  },
});
