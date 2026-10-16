// Renders every still to PNG without a browser (Node strips the types):
//   node prototypes/00-stills/scripts/render.ts <outDir> [scale=2] [t=2.5] [bob=coral] [only=id,id] [view=final]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { PALETTES } from "../src/kit/bob.ts";
import { Renderer, type View } from "../src/kit/render.ts";
import { SCENES } from "../src/scenes/index.ts";

const [out = "stills-out", scaleArg = "2", tArg = "2.5", bob = "coral", only = "", view = "final"] = process.argv.slice(2);
const scale = Number(scaleArg), t = Number(tArg);
mkdirSync(out, { recursive: true });

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

for (const def of SCENES) {
  if (only && !only.split(",").includes(def.id)) continue;
  const t0 = performance.now();
  const r = new Renderer(def.build({ seed: 7, palette: PALETTES[bob] ?? PALETTES.coral }));
  const t1 = performance.now();
  const img = { width: def.w, height: def.h, data: new Uint8ClampedArray(def.w * def.h * 4) } as ImageData;
  r.render(img, t, view as View);
  const t2 = performance.now();
  const W = def.w * scale, H = def.h * scale, big = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = ((Math.floor(y / scale) * def.w) + Math.floor(x / scale)) * 4, d = (y * W + x) * 4;
      big[d] = img.data[s]; big[d + 1] = img.data[s + 1]; big[d + 2] = img.data[s + 2]; big[d + 3] = 255;
    }
  writeFileSync(join(out, `${def.id}.png`), png(W, H, big));
  console.log(`${def.id}: build ${(t1 - t0).toFixed(0)} ms, frame ${(t2 - t1).toFixed(0)} ms`);
}
