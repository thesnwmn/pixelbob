// The painted levels' tool (Node strips the types):
//   node game/scripts/levels.ts [dir]            check every level folder in game/levels/ (or dir); the health check runs this
//   node game/scripts/levels.ts palette <out.gpl>  write the level palette, for Aseprite, GIMP or Krita
//   node game/scripts/levels.ts new <id> <w> <h>   start a level: rock ground, a spawn and a finish
// See docs/tech-and-toolchain.md#level-format.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { M, MATS, PAINT } from "@pixelbob/sim";
import { LEVEL_WIDTHS } from "../src/scenario.ts";
import { LEVELS_DIR, loadLevels } from "./load-levels.ts";

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "palette") {
  const [out] = args;
  if (!out) usage();
  const rows = PAINT.map((c, id) => `${(c >> 16) & 255} ${(c >> 8) & 255} ${c & 255}\t${MATS[id].name}`);
  writeFileSync(out, `GIMP Palette\nName: Pixelbob materials\nColumns: 8\n#\n${rows.join("\n")}\n`);
  console.log(`${out}: ${PAINT.length} materials, index = material id`);
} else if (cmd === "new") {
  const [id, ws, hs] = args;
  const w = Number(ws), h = Number(hs);
  if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || !(w >= 40 && h >= 30)) usage();
  const dir = join(LEVELS_DIR, id);
  if (existsSync(dir)) fail(`game/levels/${id} already exists`);
  const ground = h - 20;
  const mat = new Uint8Array(w * h);
  for (let y = ground; y < h; y++) for (let x = 0; x < w; x++) mat[y * w + x] = y < ground + 3 ? M.plant : y < ground + 8 ? M.dirt : M.rock;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "materials.png"), indexedPng(w, h, mat));
  const level = { title: id, seed: 7, spawn: { x: 20, y: ground - 12 }, finish: { x0: w - 30, y0: 0, x1: w, y1: h }, checkpoints: [], bits: [], lamps: [] };
  writeFileSync(join(dir, "level.json"), JSON.stringify(level, null, 2) + "\n");
  console.log(`game/levels/${id}: ${w} × ${h}. Add it to LEVEL_WIDTHS in game/src/scenario.ts, and a scenario to play it.`);
} else if (args.length === 0 && (cmd === undefined || existsSync(cmd))) {
  const dir = cmd ?? LEVELS_DIR;
  const levels = loadLevels(dir);
  let bad = 0;
  for (const [id, { w, errors }] of levels) {
    // The game's own levels must be nameable by a scenario.
    if (resolve(dir) === resolve(LEVELS_DIR) && w !== undefined && (LEVEL_WIDTHS as Record<string, number>)[id] !== w) errors.push(`add "${id}": ${w} to LEVEL_WIDTHS in game/src/scenario.ts, so a scenario can name it`);
    if (errors.length) bad++;
    for (const e of errors) console.log(`game/levels/${id}: ${e}`);
  }
  console.log(bad ? `${bad} of ${levels.size} levels broken` : `${levels.size} level${levels.size === 1 ? "" : "s"}`);
  process.exitCode = bad ? 1 : 0;
} else usage();

/** An 8-bit indexed PNG with the level palette, so index = material id. */
function indexedPng(w: number, h: number, mat: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) raw.set(mat.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.from(PAINT.flatMap((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function usage(): never {
  console.log("usage: node game/scripts/levels.ts [dir] | palette <out.gpl> | new <id> <w> <h>");
  process.exit(1);
}

function fail(msg: string): never {
  console.log(msg);
  process.exit(1);
}
