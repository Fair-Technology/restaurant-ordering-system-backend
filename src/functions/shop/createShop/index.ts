import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateShop } from '../../../application/shop/createShop/executeCreateShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createShop', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await request.json() as any;
      
      const result = await executeCreateShop(body, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createShop', error);
    }
  }
});
