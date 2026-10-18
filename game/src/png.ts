// Reads a PNG into RGBA, for a level's materials.png. No DOM, so it runs in Node too: the
// caller brings the inflate (node:zlib's inflateSync in Node, `inflateStream` in a browser),
// which is the one part that's different in each.
//
// Takes what paint tools save for a pixel-art layer: indexed (1, 2, 4 or 8 bits, with tRNS
// for transparency), RGB or RGBA, 8 bits a channel, not interlaced.

export interface Image {
  w: number;
  h: number;
  /** 4 bytes a pixel, row by row. */
  rgba: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

interface Chunks {
  w: number;
  h: number;
  depth: number;
  type: number;
  interlace: number;
  plte?: Uint8Array;
  trns?: Uint8Array;
  /** The zlib stream, the IDAT chunks joined. */
  data: Uint8Array<ArrayBuffer>;
}

function chunks(bytes: Uint8Array): Chunks {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Uint8Array[] = [];
  let head: Omit<Chunks, "data" | "plte" | "trns"> | undefined, plte: Uint8Array | undefined, trns: Uint8Array | undefined;
  for (let p = 8; p + 8 <= bytes.length; ) {
    const len = view.getUint32(p);
    const name = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (p + 12 + len > bytes.length) throw new Error(`the ${name} chunk is cut short`);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (name === "IHDR") head = { w: view.getUint32(p + 8), h: view.getUint32(p + 12), depth: body[8], type: body[9], interlace: body[12] };
    else if (name === "PLTE") plte = body;
    else if (name === "tRNS") trns = body;
    else if (name === "IDAT") idat.push(body);
    else if (name === "IEND") break;
    p += 12 + len;
  }
  if (!head) throw new Error("no IHDR chunk");
  if (!idat.length) throw new Error("no image data");
  const data = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((o, c) => (data.set(c, o), o + c.length), 0);
  return { ...head, plte, trns, data };
}

/** Decodes a PNG; throws, saying why, on one it can't read. */
export function decodePng(bytes: Uint8Array, inflate: (z: Uint8Array) => Uint8Array): Image {
  const c = chunks(bytes);
  const { w, h, depth, type } = c;
  const channels = type === 3 ? 1 : type === 2 ? 3 : type === 6 ? 4 : 0;
  if (!channels) throw new Error(`colour type ${type}: save it indexed, RGB or RGBA`);
  if (type === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8) throw new Error(`${depth}-bit ${type === 3 ? "indexed" : "colour"}: save it with 8 bits a channel`);
  if (c.interlace) throw new Error("interlaced: save it without interlacing");
  if (type === 3 && !c.plte) throw new Error("indexed, but no palette");

  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = (w * channels * depth + 7) >> 3;
  const raw = inflate(c.data);
  if (raw.length < h * (stride + 1)) throw new Error("the image data is cut short");
  const rows = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error(`row ${y}: unknown filter ${filter}`);
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rows[dst + i - bpp] : 0;
      const b = y ? rows[dst - stride + i] : 0;
      const cc = y && i >= bpp ? rows[dst - stride + i - bpp] : 0;
      const x = raw[src + i];
      rows[dst + i] = filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, cc);
    }
  }

  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, r = y * stride;
      if (type === 3) {
        const bit = x * depth;
        const k = (rows[r + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        if (3 * k + 2 >= c.plte!.length) throw new Error(`pixel ${x}, ${y}: palette index ${k} isn't in the palette`);
        rgba[o] = c.plte![3 * k];
        rgba[o + 1] = c.plte![3 * k + 1];
        rgba[o + 2] = c.plte![3 * k + 2];
        rgba[o + 3] = c.trns && k < c.trns.length ? c.trns[k] : 255;
      } else {
        const i = r + x * channels;
        rgba[o] = rows[i];
        rgba[o + 1] = rows[i + 1];
        rgba[o + 2] = rows[i + 2];
        rgba[o + 3] = channels === 4 ? rows[i + 3] : 255;
      }
    }
  return { w, h, rgba };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes a PNG with the platform's DecompressionStream (browsers, and Node 18 on). */
export async function decodePngAsync(bytes: Uint8Array): Promise<Image> {
  const z = chunks(bytes).data;
  const out = await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
  return decodePng(bytes, () => new Uint8Array(out));
}
