import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeImage, normalizeImageContain } from '../../src/infrastructure/image/normalizeImage';

const DISH = { width: 1200, height: 900 };
const DISH_MIN = { width: 800, height: 600 };
const COVER = { width: 1920, height: 640 };
const COVER_MIN = { width: 1200, height: 400 };

// Left half red, right half blue: lets us see which way the picture ended up.
async function halves(w: number, h: number): Promise<Buffer> {
  const left = await sharp({ create: { width: w / 2, height: h, channels: 3, background: '#ff0000' } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: '#0000ff' } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

const px = async (b: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

describe('normalizeImage', () => {
  it('oversized, EXIF-rotated, wrong-format (WebP bytes into a JPEG) lands upright at exactly 1200 x 900', async () => {
    // raw 2400 x 3200 portrait data with orientation 6 displays as 3200 x 2400 landscape.
    const raw = await sharp(await halves(2400, 3200)).webp().withMetadata({ orientation: 6 }).toBuffer();
    const r = await normalizeImage(raw, DISH, DISH_MIN, 'jpg');
    if (r.status !== 'ok') throw new Error(r.status);
    const meta = await sharp(r.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1200, 900]);
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    // Raw: red left half. Rotated 90 CW, the red half becomes the TOP half.
    const top = await px(r.bytes, 600, 100);
    const bottom = await px(r.bytes, 600, 800);
    expect(top[0]).toBeGreaterThan(200);
    expect(top[2]).toBeLessThan(60);
    expect(bottom[2]).toBeGreaterThan(200);
    expect(bottom[0]).toBeLessThan(60);
  });

  it('cover: gif/png input becomes exactly 1920 x 640 in the requested format', async () => {
    const gif = await sharp(await halves(2400, 1000)).gif().toBuffer();
    for (const fmt of ['png', 'webp', 'jpg'] as const) {
      const r = await normalizeImage(gif, COVER, COVER_MIN, fmt);
      if (r.status !== 'ok') throw new Error(r.status);
      const meta = await sharp(r.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([1920, 640]);
      expect(meta.format).toBe(fmt === 'jpg' ? 'jpeg' : fmt);
    }
  });

  it('refuses a source under the minimum, judged after orientation', async () => {
    const small = await sharp(await halves(700, 500)).jpeg().toBuffer();
    expect(await normalizeImage(small, DISH, DISH_MIN, 'jpg')).toEqual({ status: 'too_small' });
    // 600 x 800 raw with orientation 6 displays 800 x 600: exactly the minimum, accepted.
    const ok = await sharp(await halves(600, 800)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await normalizeImage(ok, DISH, DISH_MIN, 'jpg')).status).toBe('ok');
    // Same raw without the flag is portrait 600 x 800: under the minimum.
    const noFlag = await sharp(await halves(600, 800)).jpeg().toBuffer();
    expect(await normalizeImage(noFlag, DISH, DISH_MIN, 'jpg')).toEqual({ status: 'too_small' });
  });

  it('refuses SVG and garbage', async () => {
    expect(await normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"/>'), DISH, DISH_MIN, 'jpg')).toEqual({ status: 'unsupported' });
    expect(await normalizeImage(Buffer.from('nope'), DISH, DISH_MIN, 'png')).toEqual({ status: 'unsupported' });
  });

  it('drops EXIF metadata', async () => {
    const withExif = await sharp(await halves(1600, 1200)).jpeg().withExif({ IFD0: { Copyright: 'secret' } }).toBuffer();
    const r = await normalizeImage(withExif, DISH, DISH_MIN, 'jpg');
    if (r.status !== 'ok') throw new Error(r.status);
    expect((await sharp(r.bytes).metadata()).exif).toBeUndefined();
  });
});

describe('normalizeImageContain (logo: fit inside 640 x 96, never cropped or upscaled)', () => {
  const LOGO = { width: 640, height: 96 };
  const size = async (b: Buffer) => {
    const m = await sharp(b).metadata();
    return [m.width, m.height];
  };
  const ok = async (input: Buffer, fmt: 'jpg' | 'png' | 'webp' = 'png') => {
    const r = await normalizeImageContain(input, LOGO, fmt);
    if (r.status !== 'ok') throw new Error(r.status);
    return r.bytes;
  };

  it('a square 1000 x 1000 becomes 96 x 96', async () => {
    expect(await size(await ok(await halves(1000, 1000)))).toEqual([96, 96]);
  });

  it('a wide 1000 x 200 becomes 480 x 96, whole (both halves still there)', async () => {
    const out = await ok(await halves(1000, 200));
    expect(await size(out)).toEqual([480, 96]);
    const left = await px(out, 20, 48);
    const right = await px(out, 460, 48);
    expect(left[0]).toBeGreaterThan(200);
    expect(right[2]).toBeGreaterThan(200);
  });

  it('a very wide 2000 x 100 is limited by width: 640 x 32', async () => {
    expect(await size(await ok(await halves(2000, 100)))).toEqual([640, 32]);
  });

  it('a small 100 x 50 is kept as is, never upscaled', async () => {
    expect(await size(await ok(await halves(100, 50)))).toEqual([100, 50]);
  });

  it('re-encodes in the requested format; png keeps alpha, jpg flattens', async () => {
    const transparent = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const png = await sharp(await ok(transparent, 'png')).metadata();
    expect(png.format).toBe('png');
    expect(png.hasAlpha).toBe(true);
    const jpg = await ok(transparent, 'jpg');
    expect((await sharp(jpg).metadata()).format).toBe('jpeg');
    expect(await px(jpg, 10, 10)).toEqual([255, 255, 255]);
    expect((await sharp(await ok(transparent, 'webp')).metadata()).format).toBe('webp');
  });

  it('applies the EXIF orientation', async () => {
    // raw 200 x 400 portrait (red left) with orientation 6 displays as 400 x 200 landscape, red on top.
    const raw = await sharp(await halves(200, 400)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await ok(raw, 'jpg');
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([192, 96]);
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    const top = await px(out, 96, 10);
    const bottom = await px(out, 96, 86);
    expect(top[0]).toBeGreaterThan(200);
    expect(bottom[2]).toBeGreaterThan(200);
  });

  it('drops EXIF metadata', async () => {
    const withExif = await sharp(await halves(400, 200)).jpeg().withExif({ IFD0: { Copyright: 'secret' } }).toBuffer();
    expect((await sharp(await ok(withExif, 'jpg')).metadata()).exif).toBeUndefined();
  });

  it('refuses SVG and garbage', async () => {
    expect(await normalizeImageContain(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'), LOGO, 'png')).toEqual({ status: 'unsupported' });
    expect(await normalizeImageContain(Buffer.from('nope'), LOGO, 'png')).toEqual({ status: 'unsupported' });
  });
});
