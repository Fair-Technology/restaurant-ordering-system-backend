import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSubmitContentReport } from '../../../application/contentReport/submitContentReport/executeSubmitContentReport';
import { SubmitContentReportBody } from '../../../application/contentReport/submitContentReport/dtos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('submitContentReport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/content-reports',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) {
        return { status: 400, jsonBody: { error: 'Request body must be a JSON object' } };
      }
      return mapResultToHttp(
        await executeSubmitContentReport(request.params.shopId, body as unknown as SubmitContentReportBody),
      );
    } catch (error) {
      return internalServerError('submitContentReport', error);
    }
  },
});
