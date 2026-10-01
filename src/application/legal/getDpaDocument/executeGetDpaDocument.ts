import { CURRENT_DPA, DPA_VERSIONS, PlatformDocument } from '../../../domain/legal/platformDocuments';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetDpaDocument(input: {
  version?: string | null;
}): Promise<ApplicationResult<PlatformDocument>> {
  if (!input.version) return { ok: true, data: CURRENT_DPA };
  const doc = DPA_VERSIONS.find((d) => d.version === input.version);
  if (!doc) return { ok: false, code: 'NOT_FOUND', error: 'Unknown agreement version' };
  return { ok: true, data: doc };
}
