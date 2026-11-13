import { deleteBlob, getBlobProperties, downloadBlob, uploadBlob } from '../../infrastructure/storage/blobStorageHelpers';
import { normalizeImage } from '../../infrastructure/image/normalizeImage';
import {
  tooSmallMessage,
  MAX_IMAGE_UPLOAD_BYTES,
  IMAGE_FORMAT_BY_EXTENSION,
  tooLargeMessage,
  wrongTypeMessage,
  type ExactImageSize,
} from '../../domain/images/imageRules';
import type { ApplicationError } from './types';

/**
 * Checks an already-uploaded blob (at most 10 MB, declared type matches its extension, a decodable raster image
 * of at least `minSource` after EXIF orientation), then rewrites it in place: auto-oriented, centre-cropped to exactly
 * `expected` and re-encoded in the extension's format. Returns null on success. Otherwise deletes the blob and returns the error to answer with.
 */
export async function verifyUploadedImageSize(
  blobPath: string,
  expected: ExactImageSize,
  minSource: ExactImageSize,
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
    const bytes = await downloadBlob(blobPath);
    if (!bytes) return notFound;
    const out = await normalizeImage(bytes, expected, minSource, expectedFormat.format as 'jpg' | 'png' | 'webp');
    if (out.status === 'ok') {
      await uploadBlob(blobPath, out.bytes, expectedFormat.contentType);
      return null;
    }
    error = out.status === 'unsupported' ? wrongType : { ok: false, code: wrongSizeCode, error: tooSmallMessage(what, minSource) };
  }
  try {
    await deleteBlob(blobPath);
  } catch (e: unknown) {
    console.error('[verifyUploadedImageSize] blob delete failed:', e instanceof Error ? e.message : e);
  }
  return error;
}
