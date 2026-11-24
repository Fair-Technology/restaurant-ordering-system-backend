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

/**
 * Auto-orients (EXIF), then shrinks to fit inside `box` keeping the aspect ratio: never cropped, never upscaled.
 * Re-encodes as `outFormat` and drops metadata (EXIF, GPS). Any decodable size is accepted.
 */
export async function normalizeImageContain(
  input: Buffer,
  box: ExactImageSize,
  outFormat: 'jpg' | 'png' | 'webp',
): Promise<{ status: 'ok'; bytes: Buffer } | { status: 'unsupported' }> {
  try {
    const meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
    if (!meta.format || !DECODABLE.has(meta.format) || !meta.width || !meta.height) return { status: 'unsupported' };

    let pipe = sharp(input, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: box.width, height: box.height, fit: 'inside', withoutEnlargement: true });
    if (outFormat === 'jpg') pipe = pipe.flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true });
    else if (outFormat === 'png') pipe = pipe.png();
    else pipe = pipe.webp({ quality: 85 });
    return { status: 'ok', bytes: await pipe.toBuffer() };
  } catch {
    return { status: 'unsupported' };
  }
}

export interface ImageVariantSpec {
  suffix: string;
  size: ExactImageSize;
  fit: 'cover' | 'contain';
}
export interface ImageVariantResult {
  suffix: string;
  bytes: Buffer;
}

/**
 * Produces one resized buffer per variant spec from the same (decodable) input.
 * Best-effort per variant: a variant that fails to encode is skipped (never throws), since the
 * canonical image is the functional requirement and variants are an optimisation.
 */
export async function normalizeImageVariants(
  input: Buffer,
  specs: ImageVariantSpec[],
  outFormat: 'jpg' | 'png' | 'webp',
): Promise<ImageVariantResult[]> {
  const results: ImageVariantResult[] = [];
  for (const spec of specs) {
    try {
      const out =
        spec.fit === 'contain'
          ? await normalizeImageContain(input, spec.size, outFormat)
          : await normalizeImage(input, spec.size, { width: 0, height: 0 }, outFormat);
      if (out.status === 'ok') results.push({ suffix: spec.suffix, bytes: out.bytes });
      else console.error(`[normalizeImageVariants] variant '${spec.suffix}' skipped: ${out.status}`);
    } catch (e: unknown) {
      console.error(`[normalizeImageVariants] variant '${spec.suffix}' failed:`, e instanceof Error ? e.message : e);
    }
  }
  return results;
}
