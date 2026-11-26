import { errorBrief } from '../../application/_shared/errorBrief';
import { getSystemConfig } from '../cosmos/system/CosmosSystemConfigRepository';

/** Never throws. A config read failure means "treat email as off" — email must never fail an order. */
export async function isPlatformEmailEnabled(): Promise<boolean> {
  try {
    const config = await getSystemConfig();
    return config.emailEnabled === true;
  } catch (err: unknown) {
    console.error('[email:gate:error] could not read emailEnabled; treating as disabled', errorBrief(err));
    return false;
  }
}
