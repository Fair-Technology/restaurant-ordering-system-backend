import { imageSize } from 'image-size';
import { downloadBlobRange } from './blobStorageHelpers';
import type { ExactImageSize } from '../../domain/images/imageRules';

// Image headers (JPEG, PNG, WebP) normally sit in the first few KB. Read a small range first and
// only fall back to bigger ranges when the size marker is not inside it (e.g. a JPEG with a big
// EXIF block before the frame header).
const RANGES_BYTES = [64 * 1024, 512 * 1024, 2 * 1024 * 1024];

export type BlobImageSize =
  | { status: 'ok'; size: ExactImageSize; format: string }
  | { status: 'missing' }
  | { status: 'unreadable' };

export async function readBlobImageSize(blobPath: string): Promise<BlobImageSize> {
  for (let i = 0; i < RANGES_BYTES.length; i++) {
    const bytes = await downloadBlobRange(blobPath, 0, RANGES_BYTES[i]);
    if (!bytes) return { status: 'missing' };
    try {
      const dims = imageSize(bytes);
      if (dims.width && dims.height) return { status: 'ok', size: { width: dims.width, height: dims.height }, format: dims.type ?? 'unknown' };
    } catch {
      // header not (fully) inside this range, try a bigger one
    }
    if (bytes.length < RANGES_BYTES[i]) break; // whole file already read
  }
  return { status: 'unreadable' };
}
