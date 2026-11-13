import sharp from 'sharp';
import type { ExactImageSize } from '../../domain/images/imageRules';

/** Real formats we decode. SVG and anything else is refused. */
const DECODABLE = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif', 'avif']);

export type NormalizeResult =
  | { status: 'ok'; bytes: Buffer }
  | { status: 'unsupported' } // not a decodable raster image
  | { status: 'too_small' }; // oriented source under the minimum

/**
 * Auto-orients (EXIF), crops to cover the exact target size (centre) and re-encodes as `outFormat`.
 * Metadata (EXIF, GPS) is dropped. Source smaller than `minSource` (after orientation) is refused, never upscaled.
 */
export async function normalizeImage(
  input: Buffer,
  target: ExactImageSize,
  minSource: ExactImageSize,
  outFormat: 'jpg' | 'png' | 'webp',
): Promise<NormalizeResult> {
  try {
    const meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
    if (!meta.format || !DECODABLE.has(meta.format) || !meta.width || !meta.height) return { status: 'unsupported' };
    const swap = (meta.orientation ?? 1) >= 5; // EXIF 5-8 are 90/270 degree turns
    const w = swap ? meta.height : meta.width;
    const h = swap ? meta.width : meta.height;
    if (w < minSource.width || h < minSource.height) return { status: 'too_small' };

    let pipe = sharp(input, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize(target.width, target.height, { fit: 'cover', position: 'centre' });
    if (outFormat === 'jpg') pipe = pipe.flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true });
    else if (outFormat === 'png') pipe = pipe.png();
    else pipe = pipe.webp({ quality: 85 });
    return { status: 'ok', bytes: await pipe.toBuffer() };
  } catch {
    return { status: 'unsupported' };
  }
}
