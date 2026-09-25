import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getUserIdFromAuth: vi.fn(async () => 'u1'),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
  saveReferenceLists: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import {
  getReferenceLists,
  saveReferenceLists,
} from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeUpdateReferenceLists } from '../../../src/application/reference/updateReferenceLists/executeUpdateReferenceLists';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

function nextFromDe() {
  return structuredClone({
    allergens: DE_REFERENCE_LISTS.allergens,
    additives: DE_REFERENCE_LISTS.additives,
    taxClasses: DE_REFERENCE_LISTS.taxClasses,
    defaultTaxClassId: DE_REFERENCE_LISTS.defaultTaxClassId,
    taxRates: DE_REFERENCE_LISTS.taxRates,
  });
}

describe('executeUpdateReferenceLists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getReferenceLists as any).mockResolvedValue(structuredClone(DE_REFERENCE_LISTS));
    (saveReferenceLists as any).mockImplementation(async (d: any) => d);
  });

  it('refuses a non-superadmin', async () => {
    (findUserById as any).mockResolvedValue({ id: 'u1', systemRole: 'user' });

    const result = await executeUpdateReferenceLists({ countryCode: 'DE', body: {} }, {} as any);

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' });
    expect(saveReferenceLists).not.toHaveBeenCalled();
  });

  it('lets a superadmin save and audits the change', async () => {
    (findUserById as any).mockResolvedValue({ id: 'u1', systemRole: 'superadmin' });

    const result = await executeUpdateReferenceLists(
      { countryCode: 'de', body: nextFromDe() },
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(saveReferenceLists).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reference_lists:DE', countryCode: 'DE', updatedBy: 'u1' }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'platform',
        action: 'reference_lists.update',
        entityId: 'reference_lists:DE',
      }),
    );
  });
});
