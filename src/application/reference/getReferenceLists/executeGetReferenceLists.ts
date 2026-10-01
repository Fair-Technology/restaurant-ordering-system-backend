import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { ApplicationResult } from '../../_shared/types';
import { ReferenceListsResultDto } from '../dtos';
import { toReferenceListsDto } from '../toReferenceListsDto';

const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

export async function executeGetReferenceLists(input: {
  countryCode: string;
  now?: Date;
}): Promise<ApplicationResult<ReferenceListsResultDto>> {
  if (!COUNTRY_CODE_PATTERN.test(input.countryCode ?? '')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'countryCode must be a two-letter ISO code' };
  }

  try {
    const cc = input.countryCode.toUpperCase();
    const doc = await getReferenceLists(cc);
    return { ok: true, data: toReferenceListsDto(doc, input.now ?? new Date()) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load reference lists' };
  }
}
