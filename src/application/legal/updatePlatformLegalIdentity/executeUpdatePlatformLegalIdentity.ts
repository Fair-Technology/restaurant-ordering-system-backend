import { HttpRequest } from '@azure/functions';
import {
  getPlatformLegalIdentity,
  savePlatformLegalIdentity,
} from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { PlatformLegalIdentity, validatePlatformIdentityInput } from '../../../domain/legal/PlatformLegalIdentity';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { PlatformLegalIdentityDto } from '../dtos';
import { toPlatformLegalIdentityDto } from '../toPlatformLegalIdentityDto';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdatePlatformLegalIdentity(
  input: { body: unknown; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PlatformLegalIdentityDto>> {
  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const valid = validatePlatformIdentityInput(input.body);
    if (typeof valid === 'string') {
      return { ok: false, code: 'INVALID_INPUT', error: valid };
    }

    const baseline = await getPlatformLegalIdentity();
    const now = input.now ?? new Date();
    const doc: PlatformLegalIdentity = {
      id: 'platform_legal_identity',
      ...valid,
      updatedAt: now.toISOString(),
      updatedBy: adminId,
    };
    await savePlatformLegalIdentity(doc);

    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: adminId,
      action: 'platform_legal_identity.update',
      entityType: 'platform_legal_identity',
      entityId: doc.id,
      entityName: 'Platform legal identity',
      changes: diffFields(
        baseline as unknown as Record<string, unknown>,
        doc as unknown as Record<string, unknown>,
        ['platformName', 'salesSiteUrl'],
        ['operator', 'euRepresentative'],
      ),
    });

    return { ok: true, data: toPlatformLegalIdentityDto(doc) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updatePlatformLegalIdentity', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update platform legal identity' };
  }
}
