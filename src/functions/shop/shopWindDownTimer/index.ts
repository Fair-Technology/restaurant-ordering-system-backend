import { app } from '@azure/functions';
import { executeWindDownShops } from '../../../application/shop/windDown/executeWindDownShops';

app.timer('shopWindDown', {
  schedule: '0 30 3 * * *', // daily, 03:30 UTC
  handler: async () => {
    await executeWindDownShops({ now: new Date() });
  },
});
