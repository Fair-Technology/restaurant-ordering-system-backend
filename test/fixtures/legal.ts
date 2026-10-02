import { ImpressumFields } from '../../src/domain/legal/impressum';
import { ShopLegal } from '../../src/domain/legal/legalTexts';
import { CURRENT_DPA } from '../../src/domain/legal/platformDocuments';
import { DEFAULT_PLATFORM_LEGAL_IDENTITY, PlatformLegalIdentity } from '../../src/domain/legal/PlatformLegalIdentity';

export const COMPLETE_GMBH: ImpressumFields = {
  legalName: 'Ma Pasta GmbH',
  legalForm: 'gmbh',
  representatives: 'Giulia Rossi',
  street: 'Gartenstraße 31',
  postcode: '60596',
  city: 'Frankfurt am Main',
  country: 'Deutschland',
  phone: '069 1234567',
  email: 'info@mapasta.example',
  registerCourt: 'Amtsgericht Frankfurt am Main',
  registerNumber: 'HRB 123456',
  vatId: 'DE123456789',
  supervisoryAuthority: '',
};

export const TERMS_TEXT = 'T'.repeat(60);
export const WITHDRAWAL_TEXT = 'W'.repeat(60);

export const COMPLETE_LEGAL: ShopLegal = {
  impressum: { ...COMPLETE_GMBH, updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'u1' },
  terms: { text: TERMS_TEXT, revision: 1, updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'u1' },
  withdrawal: { text: WITHDRAWAL_TEXT, revision: 1, updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'u1' },
  privacyAddition: null,
  revisions: [],
};

export const ACCEPTED_DPA = {
  version: CURRENT_DPA.version,
  acceptedAt: '2026-10-01T00:00:00Z',
  acceptedByUserId: 'u1',
  shopNameAtAcceptance: 'Pizzeria',
};

export const COMPLETE_IDENTITY: PlatformLegalIdentity = {
  ...DEFAULT_PLATFORM_LEGAL_IDENTITY,
  operator: {
    legalName: 'Fair Technology Pty Ltd',
    address: '1 Example St, Sydney NSW 2000, Australia',
    email: 'legal@fair.example',
  },
};
