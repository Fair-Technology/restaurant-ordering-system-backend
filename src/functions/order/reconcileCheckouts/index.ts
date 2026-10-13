import { app } from '@azure/functions';
import { executeReconcileCheckouts } from '../../../application/order/reconcile/executeReconcileCheckouts';

app.timer('reconcileCheckouts', { schedule: '30 */2 * * * *', handler: async () => { await executeReconcileCheckouts({ now: new Date() }); } });
