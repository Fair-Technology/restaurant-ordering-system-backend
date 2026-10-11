import { deleteBlob } from '../../infrastructure/storage/blobStorageHelpers';
import { readBlobImageSize } from '../../infrastructure/storage/blobImageSize';
import { isExactSize, wrongSizeMessage, type ExactImageSize } from '../../domain/images/imageRules';
import type { ApplicationError } from './types';

/**
 * Reads the real pixel size of an already-uploaded blob (header only). Returns null when it is
 * exactly `expected`. Otherwise deletes the blob and returns the error to answer with.
 */
export async function verifyUploadedImageSize(
  blobPath: string,
  expected: ExactImageSize,
  what: string,
  wrongSizeCode: string,
): Promise<ApplicationError | null> {
  const found = await readBlobImageSize(blobPath);
  if (found.status === 'missing') {
    return { ok: false, code: 'INVALID_INPUT', error: `${what} was not found - upload it first` };
  }
  if (found.status === 'ok' && isExactSize(found.size, expected)) return null;

  try {
    await deleteBlob(blobPath);
  } catch (e: unknown) {
    console.error('[verifyUploadedImageSize] blob delete failed:', e instanceof Error ? e.message : e);
  }
  return { ok: false, code: wrongSizeCode, error: wrongSizeMessage(what, expected) };
}
