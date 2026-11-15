import { app } from '@azure/functions';
import { runRetention } from '../../../application/legal/retention/runRetention';

// Daily sweep of diner delivery addresses past their retention window (SPECS §15). The window comes
// from DELIVERY_ADDRESS_RETENTION_DAYS (default 180, provisional) — never a hard-coded number.
app.timer('deliveryAddressRetention', {
  schedule: '0 45 3 * * *', // daily, 03:45 UTC
  handler: async () => {
    await runRetention({ now: new Date() });
  },
});
