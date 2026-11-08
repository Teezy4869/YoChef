// Minimal in-memory ZIP reader (stored + deflate) using only node:zlib.
// Every entry is verified against its CRC32. ZIP64 is rejected (the dataset
// is far below 4 GB / 65535 entries). Nothing is written to disk here.
import { crc32, inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** @returns {Map<string, Buffer>} entry name -> content (directories skipped) */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: end of central directory not found');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip: ZIP64 is not supported');

  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error(`zip: bad central header at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('zip: ZIP64 is not supported');
    if (buf.readUInt32LE(localOff) !== LOCAL) throw new Error(`zip: bad local header for ${name}`);
    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`zip: unsupported compression method ${method} for ${name}`);

    if (data.length !== usize) throw new Error(`zip: size mismatch for ${name}`);
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${name}`);
    out.set(name, data);
  }
  return out;
}
