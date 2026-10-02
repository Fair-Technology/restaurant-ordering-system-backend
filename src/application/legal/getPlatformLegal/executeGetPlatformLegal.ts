import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { CURRENT_DPA, SUB_PROCESSORS } from '../../../domain/legal/platformDocuments';
import { ApplicationResult } from '../../_shared/types';
import { PlatformLegalPublicDto } from '../dtos';

export async function executeGetPlatformLegal(): Promise<ApplicationResult<PlatformLegalPublicDto>> {
  try {
    const identity = await getPlatformLegalIdentity();
    return {
      ok: true,
      data: {
        platformName: identity.platformName,
        salesSiteUrl: identity.salesSiteUrl,
        operator: identity.operator,
        euRepresentative: identity.euRepresentative,
        subProcessors: [...SUB_PROCESSORS],
        currentDpaVersion: CURRENT_DPA.version,
        currentDpaIsDraft: CURRENT_DPA.isDraft,
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load platform details' };
  }
}
