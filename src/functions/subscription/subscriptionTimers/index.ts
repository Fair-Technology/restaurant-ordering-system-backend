import { app } from '@azure/functions';
import { executeProcessSubscriptionTimers } from '../../../application/subscription/timers/executeProcessSubscriptionTimers';

app.timer('subscriptionTimers', {
  schedule: '0 5 * * * *', // hourly, at five past
  handler: async () => {
    await executeProcessSubscriptionTimers({ now: new Date() });
  },
});
