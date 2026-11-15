import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOptionGroup } from '../../../application/optionGroup/getOptionGroup/executeGetOptionGroup';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOptionGroup', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups/{groupId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const groupId = request.params.groupId;

      const result = await executeGetOptionGroup({ shopId, groupId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getOptionGroup', error);
    }
  },
});
