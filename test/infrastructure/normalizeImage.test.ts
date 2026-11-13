import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeImage } from '../../src/infrastructure/image/normalizeImage';

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
