// Renders a filmstrip of a run to PNG (Node strips the types):
//   node game/scripts/filmstrip.ts <replay> <out.png> [shots=6] [scale=2]
// <replay> is a kept replay's id (game/replays/<id>.json) or a file holding a replay's text
// (a pasted feedback report will do).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { filmstrip } from "../src/filmstrip.ts";
import { decode, findReplay } from "../src/replay.ts";
import { parseScenario } from "../src/scenario.ts";

const [which, out, shots = "6", scale = "2"] = process.argv.slice(2);
if (!which || !out) {
  console.log("usage: node game/scripts/filmstrip.ts <replay id or file> <out.png> [shots=6] [scale=2]");
  process.exit(1);
}
const kept = new URL(`../replays/${which}.json`, import.meta.url);
const text = existsSync(kept) ? (JSON.parse(readFileSync(kept, "utf8")) as { replay: string }).replay : findReplay(readFileSync(which, "utf8"));
const { replay, errors } = decode(text);
if (!replay) {
  console.log(errors.join("\n"));
  process.exit(1);
}
const file = new URL(`../scenarios/${replay.scenario}.json`, import.meta.url);
const { scenario, errors: bad } = parseScenario(replay.scenario, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
if (!scenario) {
  console.log(`game/scenarios/${replay.scenario}.json: ${bad.join("; ")}`);
  process.exit(1);
}
const strip = filmstrip(scenario, replay, { shots: Number(shots), scale: Number(scale) });
writeFileSync(out, png(strip.w, strip.h, strip.rgba));
console.log(`${out}: ${strip.w}×${strip.h}, frames ${strip.frames.join(", ")}`);

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
