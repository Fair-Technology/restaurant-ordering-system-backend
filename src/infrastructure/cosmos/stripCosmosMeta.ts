const COSMOS_META_KEYS = ['_rid', '_self', '_etag', '_attachments', '_ts'];

/** Returns a copy without Cosmos's internal bookkeeping keys. */
export function stripCosmosMeta<T extends object>(doc: T): T {
  const copy = { ...doc } as Record<string, unknown>;
  for (const key of COSMOS_META_KEYS) delete copy[key];
  return copy as T;
}

/** Applies {@link stripCosmosMeta} to every element. */
export function stripCosmosMetaAll<T extends object>(docs: T[]): T[] {
  return docs.map((doc) => stripCosmosMeta(doc));
}
