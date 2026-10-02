import { app } from '@azure/functions';
import { executeProcessOrderTimers } from '../../../application/order/timers/executeProcessOrderTimers';

app.timer('orderTimers', {
  schedule: '0 * * * * *', // every minute
  handler: async () => {
    await executeProcessOrderTimers({ now: new Date() });
  },
});
