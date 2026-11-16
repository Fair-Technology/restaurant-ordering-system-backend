/**
 * A minimal ZIP writer: every entry is *stored* (method 0, no compression). The archive holds PDFs, which are
 * already compressed, so deflating them again would cost CPU for no size gain — and storing keeps this to a few
 * dozen lines instead of a dependency. No data descriptors and no ZIP64: documents are small, and a plain
 * archive opens everywhere.
 *
 * Layout: [local header + name + data] for every entry, then the central directory (one record per entry, which
 * is what unzip tools actually read first), then the end-of-central-directory record (EOCD) that points at it.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  modifiedAt: Date;
}

// CRC-32 (IEEE, reflected, polynomial 0xEDB88320) — the checksum every ZIP entry carries. Table built once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS time/date are 16-bit packed fields in local time with 2-second resolution; years start at 1980. */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(at.getUTCFullYear(), 1980);
  // UTC fields keep the output identical on every machine regardless of its time zone.
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1);
  const date = ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  return { time, date };
}

const UTF8_NAME_FLAG = 0x0800; // bit 11: the name is UTF-8, not the legacy CP437
const VERSION_NEEDED = 20; // 2.0: the lowest version that knows stored + directories; plenty for us

export function buildStoreZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map((e) => ({ ...e, nameBytes: encoder.encode(e.name), crc: crc32(e.data) }));

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;
  const u16 = (v: number) => {
    view.setUint16(pos, v, true); // ZIP is little-endian throughout
    pos += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(pos, v, true);
    pos += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, pos);
    pos += b.length;
  };

  // The central directory records where each local header starts, so remember the offsets.
  const offsets: number[] = [];
  for (const e of prepared) {
    const { time, date } = dosDateTime(e.modifiedAt);
    offsets.push(pos);
    u32(0x04034b50); // local file header signature "PK\3\4"
    u16(VERSION_NEEDED);
    u16(UTF8_NAME_FLAG);
    u16(0); // method 0 = stored
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.length); // compressed size == uncompressed size when stored
    u32(e.data.length);
    u16(e.nameBytes.length);
    u16(0); // no extra field
    bytes(e.nameBytes);
    bytes(e.data);
  }

  const centralStart = pos;
  prepared.forEach((e, i) => {
    const { time, date } = dosDateTime(e.modifiedAt);
    u32(0x02014b50); // central directory header signature "PK\1\2"
    u16(VERSION_NEEDED); // version made by
    u16(VERSION_NEEDED); // version needed
    u16(UTF8_NAME_FLAG);
    u16(0);
    u16(time);
    u16(date);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.nameBytes.length);
    u16(0); // extra field length
    u16(0); // comment length
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    bytes(e.nameBytes);
  });

  const centralSizeBytes = pos - centralStart; // measured before the EOCD itself advances `pos`
  u32(0x06054b50); // EOCD signature "PK\5\6"
  u16(0); // this disk
  u16(0); // disk with the central directory
  u16(prepared.length); // entries on this disk
  u16(prepared.length); // entries in total
  u32(centralSizeBytes); // central directory size
  u32(centralStart); // central directory offset
  u16(0); // comment length
  return out;
}
