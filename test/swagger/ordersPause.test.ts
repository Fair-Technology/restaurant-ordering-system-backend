import { describe, expect, it } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

const schemas = swaggerSpec.components.schemas as any;

describe('swagger orders pause', () => {
  it('the pause duration choices are documented', () => {
    expect(schemas.UpdateShopRequest.properties.ordersPausedFor.enum).toEqual(['minutes_30', 'rest_of_day', 'until_switched_back']);
  });
  it('the shop response carries the pause end and the automatic mark', () => {
    const props = schemas.ShopResponse.properties;
    expect(props.ordersPausedUntil).toBeDefined();
    expect(props.ordersAutoPaused).toBeDefined();
    expect(props.missedOrdersPauseLimit).toBeDefined();
  });
  it('the limit endpoint is documented', () => {
    expect((swaggerSpec.paths as any)['/shops/{shopId}/missed-orders-pause'].put.operationId).toBe('setMissedOrdersPauseLimit');
  });
});
