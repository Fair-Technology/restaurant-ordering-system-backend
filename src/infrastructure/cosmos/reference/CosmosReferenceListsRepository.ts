import { defaultReferenceLists, ReferenceListsDoc, referenceListsId } from '../../../domain/reference/ReferenceLists';
import { systemConfigContainer } from '../cosmosClient';

export async function findStoredReferenceLists(countryCode: string): Promise<ReferenceListsDoc | null> {
  try {
    const id = referenceListsId(countryCode);
    const { resource } = await systemConfigContainer.item(id, id).read<ReferenceListsDoc>();
    return resource ?? null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function getReferenceLists(countryCode: string): Promise<ReferenceListsDoc> {
  const stored = await findStoredReferenceLists(countryCode);
  return stored ?? defaultReferenceLists(countryCode);
}

export async function saveReferenceLists(doc: ReferenceListsDoc): Promise<ReferenceListsDoc> {
  await systemConfigContainer.items.upsert<ReferenceListsDoc>(doc);
  return doc;
}
