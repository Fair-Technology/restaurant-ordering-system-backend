import { describe, expect, it } from 'vitest';
import { buildStoreZip, crc32 } from '../../src/infrastructure/zip/storeZip';

const enc = (s: string) => new TextEncoder().encode(s);
const at = new Date('2026-10-05T10:30:42Z');

describe('crc32', () => {
  it('matches the published vectors', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(enc(''))).toBe(0);
    expect(crc32(enc('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('buildStoreZip', () => {
  const a = enc('hello');
  const b = enc('second entry bytes');
  const zip = buildStoreZip([
    { name: 'a.pdf', data: a, modifiedAt: at },
    { name: 'Rechnung-ü.pdf', data: b, modifiedAt: at },
  ]);
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const nameBytes = enc('Rechnung-ü.pdf').length;

  it('ends with an EOCD that counts both entries and points at the central directory', () => {
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 8, true)).toBe(2);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cdSize = v.getUint32(eocd + 12, true);
    const cdOffset = v.getUint32(eocd + 16, true);
    expect(cdOffset + cdSize).toBe(eocd);
    expect(cdSize).toBe(46 + 5 + 46 + nameBytes);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
  });

  it('lays out local headers back to back, stored, with the data after the name', () => {
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint16(6, true)).toBe(0x0800); // UTF-8 name flag
    expect(v.getUint16(8, true)).toBe(0); // stored
    expect(v.getUint32(14, true)).toBe(crc32(a));
    expect(v.getUint32(18, true)).toBe(a.length);
    expect(v.getUint32(22, true)).toBe(a.length);
    expect(Buffer.from(zip.subarray(30, 35)).toString()).toBe('a.pdf');
    expect(Buffer.from(zip.subarray(35, 40)).toString()).toBe('hello');

    const second = 30 + 5 + a.length; // offset of the second local header
    expect(v.getUint32(second, true)).toBe(0x04034b50);
    expect(v.getUint16(second + 26, true)).toBe(nameBytes);
    expect(Buffer.from(zip.subarray(second + 30, second + 30 + nameBytes)).toString('utf8')).toBe('Rechnung-ü.pdf');
    expect(Buffer.from(zip.subarray(second + 30 + nameBytes, second + 30 + nameBytes + b.length)).toString()).toBe(
      'second entry bytes',
    );
  });

  it('central directory records point at the local headers', () => {
    const eocd = zip.length - 22;
    const cd = v.getUint32(eocd + 16, true);
    expect(v.getUint32(cd + 42, true)).toBe(0);
    expect(v.getUint32(cd + 24, true)).toBe(a.length);
    const cd2 = cd + 46 + 5;
    expect(v.getUint32(cd2 + 42, true)).toBe(30 + 5 + a.length);
    expect(v.getUint32(cd2 + 16, true)).toBe(crc32(b));
  });

  it('encodes DOS time and date and is deterministic', () => {
    expect(v.getUint16(10, true)).toBe((10 << 11) | (30 << 5) | 21);
    expect(v.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 5);
    const again = buildStoreZip([
      { name: 'a.pdf', data: a, modifiedAt: at },
      { name: 'Rechnung-ü.pdf', data: b, modifiedAt: at },
    ]);
    expect(Buffer.from(again).equals(Buffer.from(zip))).toBe(true);
  });

  it('an empty archive is just the EOCD', () => {
    expect(buildStoreZip([]).length).toBe(22);
  });
});
