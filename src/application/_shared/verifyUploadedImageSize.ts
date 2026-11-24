import { deleteBlob, getBlobProperties, downloadBlob, uploadBlob } from '../../infrastructure/storage/blobStorageHelpers';
import { normalizeImage, normalizeImageContain, normalizeImageVariants } from '../../infrastructure/image/normalizeImage';
import {
  tooSmallMessage,
  MAX_IMAGE_UPLOAD_BYTES,
  IMAGE_FORMAT_BY_EXTENSION,
  tooLargeMessage,
  wrongTypeMessage,
  variantSuffix,
  type ExactImageSize,
} from '../../domain/images/imageRules';
import type { ApplicationError } from './types';

/**
 * Checks an already-uploaded blob (at most 10 MB, declared type matches its extension, a decodable raster image),
 * then rewrites it in place, auto-oriented and re-encoded in the extension's format with metadata dropped:
 * - `fit: 'cover'` (default; cover, dish): the source must be at least `minSource` after EXIF orientation, and is
 *   centre-cropped to exactly `expected`; a smaller source answers `wrongSizeCode`.
 * - `fit: 'contain'` (logo): `expected` is a bounding box; the image is shrunk to fit inside it, never cropped or
 *   upscaled. There is no minimum, so `minSource` and `wrongSizeCode` are unused (pass null).
 * Optional `variants` (sibling blobs `variantSuffix(blobPath, suffix)`) are rendered from the original source,
 * best-effort: a variant failure never changes the result.
 * Returns null on success. Otherwise deletes the blob and returns the error to answer with.
 */
export async function verifyUploadedImageSize(
  blobPath: string,
  expected: ExactImageSize,
  minSource: ExactImageSize | null,
  what: string,
  wrongSizeCode: string | null,
  fit: 'cover' | 'contain' = 'cover',
  variants: { suffix: string; size: ExactImageSize }[] = [],
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
    const outFormat = expectedFormat.format as 'jpg' | 'png' | 'webp';
    const out =
      fit === 'contain' || !minSource
        ? await normalizeImageContain(bytes, expected, outFormat)
        : await normalizeImage(bytes, expected, minSource, outFormat);
    if (out.status === 'ok') {
      await uploadBlob(blobPath, out.bytes, expectedFormat.contentType);
      if (variants.length > 0) {
        try {
          const rendered = await normalizeImageVariants(
            bytes,
            variants.map((v) => ({ ...v, fit })),
            outFormat,
          );
          for (const v of rendered) {
            try {
              await uploadBlob(variantSuffix(blobPath, v.suffix), v.bytes, expectedFormat.contentType);
            } catch (e: unknown) {
              console.error(`[verifyUploadedImageSize] variant '${v.suffix}' upload failed:`, e instanceof Error ? e.message : e);
            }
          }
        } catch (e: unknown) {
          console.error('[verifyUploadedImageSize] variants failed:', e instanceof Error ? e.message : e);
        }
      }
      return null;
    }
    error =
      out.status === 'too_small' && minSource && wrongSizeCode
        ? { ok: false, code: wrongSizeCode, error: tooSmallMessage(what, minSource) }
        : wrongType;
  }
  try {
    await deleteBlob(blobPath);
  } catch (e: unknown) {
    console.error('[verifyUploadedImageSize] blob delete failed:', e instanceof Error ? e.message : e);
  }
  return error;
}
