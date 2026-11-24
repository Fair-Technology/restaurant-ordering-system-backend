import { deleteBlob } from '../../infrastructure/storage/blobStorageHelpers';
import { variantSuffix } from '../../domain/images/imageRules';

/**
 * Deletes a canonical image blob and its derived variant siblings. The canonical delete behaves as
 * `deleteBlob` does (errors propagate); variant deletes are best-effort (logged, never thrown).
 * A variant that was never generated is a no-op.
 */
export async function deleteBlobWithVariants(path: string, suffixes: string[]): Promise<void> {
  await deleteBlob(path);
  for (const s of suffixes) {
    try {
      await deleteBlob(variantSuffix(path, s));
    } catch (e: unknown) {
      console.error(`[deleteBlobWithVariants] variant '${s}' delete failed:`, e instanceof Error ? e.message : e);
    }
  }
}
