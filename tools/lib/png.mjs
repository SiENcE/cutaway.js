// Minimal PNG reader and writer for the Node tools (no dependencies).
// decode: 8-bit greyscale, RGB, palette (also 1/2/4-bit), grey+alpha and RGBA, with tRNS; no interlace.
// encode: 8-bit RGBA.
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** @param {Buffer} buf @returns {{width: number, height: number, data: Uint8Array}} RGBA pixels */
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNGs are not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error("unsupported PNG colour type " + type);
  if (depth !== 8 && !(type === 3 && depth < 8)) throw new Error(`unsupported bit depth ${depth} for type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (channels * depth) >> 3), stride = Math.ceil((width * channels * depth) / 8);
  const lines = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride), prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, row = lines.subarray(y * stride);
    if (type === 3) {
      const per = 8 / depth, byte = row[Math.floor(x / per)], idx = depth === 8 ? byte : (byte >> ((per - 1 - (x % per)) * depth)) & ((1 << depth) - 1);
      data[o] = palette[idx * 3]; data[o + 1] = palette[idx * 3 + 1]; data[o + 2] = palette[idx * 3 + 2];
      data[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (type === 6) { data.set(row.subarray(x * 4, x * 4 + 4), o); }
    else if (type === 2) { data.set(row.subarray(x * 3, x * 3 + 3), o); data[o + 3] = 255; }
    else if (type === 4) { data[o] = data[o + 1] = data[o + 2] = row[x * 2]; data[o + 3] = row[x * 2 + 1]; }
    else { data[o] = data[o + 1] = data[o + 2] = row[x]; data[o + 3] = 255; }
  }
  return { width, height, data };
}

/** Width and height from the header only. @param {Buffer} buf */
export function size(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
/** @param {Buffer} b */
function crc32(b) { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
/** @param {string} kind @param {Buffer} body */
function chunk(kind, body) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), head = Buffer.from(kind, "latin1");
  len.writeUInt32BE(body.length); crc.writeUInt32BE(crc32(Buffer.concat([head, body])));
  return Buffer.concat([len, head, body, crc]);
}

/** @param {{width: number, height: number, data: Uint8Array}} img RGBA @returns {Buffer} */
export function encode({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
