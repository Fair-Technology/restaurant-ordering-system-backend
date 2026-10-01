import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import {
  getReferenceLists,
  saveReferenceLists,
} from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { referenceListsId } from '../../../domain/reference/ReferenceLists';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { ReferenceListsResultDto } from '../dtos';
import { toReferenceListsDto } from '../toReferenceListsDto';
import { validateReferenceListsUpdate } from './validateReferenceListsUpdate';

const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

export async function executeUpdateReferenceLists(
  input: { countryCode: string; body: unknown; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ReferenceListsResultDto>> {
  if (!COUNTRY_CODE_PATTERN.test(input.countryCode ?? '')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'countryCode must be a two-letter ISO code' };
  }
  const cc = input.countryCode.toUpperCase();

  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const baseline = await getReferenceLists(cc);
    const now = input.now ?? new Date();
    const valid = validateReferenceListsUpdate(baseline, input.body, now);
    if (typeof valid === 'string') {
      return { ok: false, code: 'INVALID_INPUT', error: valid };
    }

    const doc = {
      id: referenceListsId(cc),
      countryCode: cc,
      ...valid,
      updatedAt: now.toISOString(),
      updatedBy: userId,
    };
    await saveReferenceLists(doc);

    const changes = diffFields(
      baseline as unknown as Record<string, unknown>,
      doc as unknown as Record<string, unknown>,
      ['defaultTaxClassId'],
      ['allergens', 'additives', 'taxClasses', 'taxRates'],
    );
    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: userId,
      action: 'reference_lists.update',
      entityType: 'reference_lists',
      entityId: doc.id,
      entityName: `Reference lists ${cc}`,
      changes,
    });

    return { ok: true, data: toReferenceListsDto(doc, now) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update reference lists' };
  }
}
