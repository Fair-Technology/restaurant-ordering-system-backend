import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOptionGroups } from '../../../application/optionGroup/getOptionGroups/executeGetOptionGroups';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOptionGroups', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      const result = await executeGetOptionGroups({ shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getOptionGroups', error);
    }
  },
});
