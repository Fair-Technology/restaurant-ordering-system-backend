import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeExportInvoiceArchive } from '../../../application/order/invoices/exportInvoiceArchive';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('exportInvoiceArchive', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/invoices/archive',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { shopId } = request.params;
      const month = request.query.get('month') ?? '';
      return mapResultToHttp(await executeExportInvoiceArchive({ shopId, month }, request));
    } catch (error) {
      return internalServerError('exportInvoiceArchive', error);
    }
  },
});
