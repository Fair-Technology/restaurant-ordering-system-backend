import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDeleteOptionGroup } from '../../../application/optionGroup/deleteOptionGroup/executeDeleteOptionGroup';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('deleteOptionGroup', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups/{groupId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const groupId = request.params.groupId;

      const result = await executeDeleteOptionGroup({ shopId, groupId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('deleteOptionGroup', error);
    }
  },
});
