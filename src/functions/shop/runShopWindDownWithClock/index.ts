import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRunShopWindDownWithClock } from '../../../application/shop/windDown/executeRunShopWindDownWithClock';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { ROUTE_ABSENT, testClockRoutesEnabled } from '../../_shared/testClockRoutes';

// Fires a destructive job on demand, so it only exists where ENABLE_TEST_CLOCK_ROUTES=true (dev).
// Elsewhere it is not registered at all, and the handler re-checks per request as a second lock.
// Deliberately left out of the published OpenAPI spec (scripts/generate-openapi.js OVERRIDES).
if (testClockRoutesEnabled()) {
  app.http('runShopWindDownWithClock', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'platform/test-clock/shops/{shopId}/wind-down',
    handler: runShopWindDownWithClockHandler,
  });
}

export async function runShopWindDownWithClockHandler(request: HttpRequest): Promise<HttpResponseInit> {
  if (!testClockRoutesEnabled()) return { ...ROUTE_ABSENT };
  try {
    const body = (await request.json().catch(() => null)) as { now?: unknown } | null;
    const result = await executeRunShopWindDownWithClock(
      { shopId: request.params.shopId, now: body && typeof body === 'object' ? body.now : undefined },
      request,
    );
    return mapResultToHttp(result);
  } catch (error) {
    return internalServerError('runShopWindDownWithClock', error);
  }
}
