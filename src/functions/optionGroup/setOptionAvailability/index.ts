import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetOptionAvailability } from '../../../application/optionGroup/setOptionAvailability/executeSetOptionAvailability';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('setOptionAvailability', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups/{groupId}/options/{optionId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const groupId = request.params.groupId;
      const optionId = request.params.optionId;
      const body = ((await request.json().catch(() => ({}))) ?? {}) as any;

      const result = await executeSetOptionAvailability({ ...body, shopId, groupId, optionId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('setOptionAvailability', error);
    }
  },
});
