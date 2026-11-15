import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRunRetentionWithClock } from '../../../application/legal/retention/executeRunRetentionWithClock';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { ROUTE_ABSENT, testClockRoutesEnabled } from '../../_shared/testClockRoutes';

// Fires the retention sweep on demand with a chosen clock, so it only exists where
// ENABLE_TEST_CLOCK_ROUTES=true (dev). Elsewhere it is not registered at all, and the handler
// re-checks per request as a second lock. Deliberately left out of the published OpenAPI spec
// (scripts/generate-openapi.js OVERRIDES).
if (testClockRoutesEnabled()) {
  app.http('runRetentionWithClock', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'platform/test-clock/retention/delivery-addresses',
    handler: runRetentionWithClockHandler,
  });
}

export async function runRetentionWithClockHandler(request: HttpRequest): Promise<HttpResponseInit> {
  if (!testClockRoutesEnabled()) return { ...ROUTE_ABSENT };
  try {
    const body = (await request.json().catch(() => null)) as { now?: unknown; shopId?: unknown } | null;
    const result = await executeRunRetentionWithClock(
      {
        now: body && typeof body === 'object' ? body.now : undefined,
        shopId: body && typeof body === 'object' ? body.shopId : undefined,
      },
      request,
    );
    return mapResultToHttp(result);
  } catch (error) {
    return internalServerError('runRetentionWithClock', error);
  }
}
