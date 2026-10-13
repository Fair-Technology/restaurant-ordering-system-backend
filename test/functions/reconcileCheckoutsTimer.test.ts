import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ timers: {} as Record<string, any> }));
vi.mock('@azure/functions', () => ({ app: { timer: (name: string, o: any) => { m.timers[name] = o; } } }));
vi.mock('../../src/application/order/reconcile/executeReconcileCheckouts', () => ({ executeReconcileCheckouts: vi.fn(async () => ({})) }));

import { executeReconcileCheckouts } from '../../src/application/order/reconcile/executeReconcileCheckouts';
import '../../src/functions/order/reconcileCheckouts/index';

describe('reconcileCheckouts timer', () => {
  it('runs the checkout safety net every two minutes', async () => {
    expect(m.timers.reconcileCheckouts.schedule).toBe('30 */2 * * * *');
    await m.timers.reconcileCheckouts.handler();
    expect(executeReconcileCheckouts).toHaveBeenCalledWith({ now: expect.any(Date) });
  });
});
