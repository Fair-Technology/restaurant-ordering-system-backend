import {
  DEFAULT_PLATFORM_LEGAL_IDENTITY,
  PlatformLegalIdentity,
} from '../../../domain/legal/PlatformLegalIdentity';
import { systemConfigContainer } from '../cosmosClient';

const PLATFORM_LEGAL_IDENTITY_ID = 'platform_legal_identity';

export async function getPlatformLegalIdentity(): Promise<PlatformLegalIdentity> {
  try {
    const { resource } = await systemConfigContainer
      .item(PLATFORM_LEGAL_IDENTITY_ID, PLATFORM_LEGAL_IDENTITY_ID)
      .read<PlatformLegalIdentity>();
    return resource ?? structuredClone(DEFAULT_PLATFORM_LEGAL_IDENTITY);
  } catch (error: any) {
    if (error.code === 404) return structuredClone(DEFAULT_PLATFORM_LEGAL_IDENTITY);
    throw error;
  }
}

export async function savePlatformLegalIdentity(doc: PlatformLegalIdentity): Promise<PlatformLegalIdentity> {
  await systemConfigContainer.items.upsert<PlatformLegalIdentity>(doc);
  return doc;
}
