import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetShopBySlug } from '../../../application/shop/getShopBySlug/executeGetShopBySlug';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getShopBySlug', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/slug/{slug}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const slug = request.params.slug;

      console.log(slug);

      const result = await executeGetShopBySlug({ slug });

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getShopBySlug', error);
    }
  },
});
