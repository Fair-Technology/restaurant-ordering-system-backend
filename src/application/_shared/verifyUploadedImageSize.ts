import { deleteBlob, getBlobProperties } from '../../infrastructure/storage/blobStorageHelpers';
import { readBlobImageSize } from '../../infrastructure/storage/blobImageSize';
import {
  isExactSize,
  wrongSizeMessage,
  MAX_IMAGE_UPLOAD_BYTES,
  IMAGE_FORMAT_BY_EXTENSION,
  tooLargeMessage,
  wrongTypeMessage,
  type ExactImageSize,
} from '../../domain/images/imageRules';
import type { ApplicationError } from './types';

/**
 * Checks an already-uploaded blob: stored size (at most 10 MB), declared type and real format (first bytes)
 * must match its extension, and the pixel size must be exactly `expected`. Returns null when all pass.
 * Otherwise deletes the blob and returns the error to answer with.
 */
export async function verifyUploadedImageSize(
  blobPath: string,
  expected: ExactImageSize,
  what: string,
  wrongSizeCode: string,
): Promise<ApplicationError | null> {
  const notFound: ApplicationError = { ok: false, code: 'INVALID_INPUT', error: `${what} was not found - upload it first` };
  const expectedFormat = IMAGE_FORMAT_BY_EXTENSION[blobPath.slice(blobPath.lastIndexOf('.')).toLowerCase()];
  const wrongType: ApplicationError = { ok: false, code: 'INVALID_INPUT', error: wrongTypeMessage(what) };
  const props = await getBlobProperties(blobPath);
  if (!props) return notFound;
  let error: ApplicationError;
  if (props.contentLength > MAX_IMAGE_UPLOAD_BYTES) error = { ok: false, code: 'INVALID_INPUT', error: tooLargeMessage(what) };
  else if (!expectedFormat || props.contentType?.toLowerCase() !== expectedFormat.contentType) error = wrongType;
  else {
    const found = await readBlobImageSize(blobPath);
    if (found.status === 'missing') return notFound;
    if (found.status === 'ok' && found.format !== expectedFormat.format) error = wrongType;
    else if (found.status === 'ok' && isExactSize(found.size, expected)) return null;
    else error = { ok: false, code: wrongSizeCode, error: wrongSizeMessage(what, expected) };
  }
  try {
    await deleteBlob(blobPath);
  } catch (e: unknown) {
    console.error('[verifyUploadedImageSize] blob delete failed:', e instanceof Error ? e.message : e);
  }
  return error;
}
