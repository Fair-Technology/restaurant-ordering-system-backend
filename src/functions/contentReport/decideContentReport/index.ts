import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDecideContentReport } from '../../../application/contentReport/decideContentReport/executeDecideContentReport';
import { DecideContentReportBody } from '../../../application/contentReport/decideContentReport/dtos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('decideContentReport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'platform/content-reports/{reportId}/decision',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) {
        return { status: 400, jsonBody: { error: 'Request body must be a JSON object' } };
      }
      return mapResultToHttp(
        await executeDecideContentReport(
          request.params.reportId,
          body as unknown as DecideContentReportBody,
          request,
        ),
      );
    } catch (error) {
      return internalServerError('decideContentReport', error);
    }
  },
});
