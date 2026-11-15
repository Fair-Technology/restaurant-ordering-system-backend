import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateOptionGroup } from '../../../application/optionGroup/createOptionGroup/executeCreateOptionGroup';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createOptionGroup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/option-groups',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = ((await request.json().catch(() => ({}))) ?? {}) as any;

      const result = await executeCreateOptionGroup({ ...body, shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createOptionGroup', error);
    }
  },
});
