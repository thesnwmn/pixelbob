import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { CAT, Cat, M, PAINT } from "@pixelbob/sim";
import { describe, expect, it } from "vitest";
import { LEVELS, parseLevel } from "../src/levels.ts";
import { Play } from "../src/play.ts";
import type { Scenario } from "../src/scenario.ts";
import { type Image, decodePng, decodePngAsync } from "../src/png.ts";
import { loadLevels, readLevel } from "../scripts/load-levels.ts";

const inflate = (z: Uint8Array) => inflateSync(z);

// ---- A PNG writer for the tests: any colour type and depth, any row filter ----

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Packed rows (`stride` bytes each) to a PNG, each row filtered with `filter(y)`. */
function png(w: number, h: number, type: number, depth: number, rows: Uint8Array, opts: { plte?: number[]; trns?: number[]; filter?: (y: number) => number } = {}): Uint8Array {
  const channels = type === 3 ? 1 : type === 2 ? 3 : 4;
  const stride = (w * channels * depth + 7) >> 3, bpp = Math.max(1, (channels * depth) >> 3);
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const f = opts.filter?.(y) ?? 0;
    raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = rows[y * stride + i], a = i >= bpp ? rows[y * stride + i - bpp] : 0, b = y ? rows[(y - 1) * stride + i] : 0, c = y && i >= bpp ? rows[(y - 1) * stride + i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = type;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (opts.plte) parts.push(chunk("PLTE", Buffer.from(opts.plte.flatMap((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]))));
  if (opts.trns) parts.push(chunk("tRNS", Buffer.from(opts.trns)));
  // Split the data over two IDAT chunks, as encoders may.
  const z = deflateSync(raw), half = z.length >> 1;
  parts.push(chunk("IDAT", z.subarray(0, half)), chunk("IDAT", z.subarray(half)), chunk("IEND", Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}

/** A level image: each cell one material, in the palette's RGBA. */
function image(w: number, h: number, at: (x: number, y: number) => number): Image {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = PAINT[at(x, y)], o = (y * w + x) * 4;
      rgba.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], o);
    }
  return { w, h, rgba };
}

// Rock below y = 20, air above.
const ground = image(60, 30, (_, y) => (y >= 20 ? M.rock : M.air));
const good = { title: "Good", spawn: { x: 10, y: 10 }, finish: { x0: 50, y0: 0, x1: 60, y1: 30 } };

describe("reading a PNG", () => {
  // A deterministic pattern, so every filter has something to predict.
  const W = 13, H = 9;
  const pattern = (x: number, y: number, k: number) => (x * 37 + y * 91 + k * 53 + ((x * y) & 7) * 11) & 255;

  it("reads RGB and RGBA with every row filter", () => {
    for (const type of [2, 6]) {
      const n = type === 2 ? 3 : 4;
      const rows = new Uint8Array(W * H * n).map((_, i) => pattern((i / n | 0) % W, (i / n / W) | 0, i % n));
      const img = decodePng(png(W, H, type, 8, rows, { filter: (y) => y % 5 }), inflate);
      expect([img.w, img.h]).toEqual([W, H]);
      for (let p = 0; p < W * H; p++)
        expect([...img.rgba.subarray(p * 4, p * 4 + 4)], `type ${type}, pixel ${p}`).toEqual([rows[p * n], rows[p * n + 1], rows[p * n + 2], n === 4 ? rows[p * n + 3] : 255]);
    }
  });

  it("reads indexed at every depth, with transparency", () => {
    const plte = [0x000000, 0x112233, 0x445566, 0x778899, ...PAINT.slice(4, 16)];
    for (const depth of [1, 2, 4, 8]) {
      const k = (x: number, y: number) => (x + 2 * y) % (1 << Math.min(depth, 4));
      const stride = (W * depth + 7) >> 3;
      const rows = new Uint8Array(H * stride);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rows[y * stride + ((x * depth) >> 3)] |= k(x, y) << (8 - depth - ((x * depth) & 7));
      const img = decodePng(png(W, H, 3, depth, rows, { plte, trns: [0], filter: (y) => y % 5 }), inflate);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = plte[k(x, y)], o = (y * W + x) * 4;
          expect([...img.rgba.subarray(o, o + 4)], `${depth}-bit, ${x}, ${y}`).toEqual([(c >> 16) & 255, (c >> 8) & 255, c & 255, k(x, y) === 0 ? 0 : 255]);
        }
    }
  });

  it("reads the same with the browser's inflate", async () => {
    const bytes = png(W, H, 2, 8, new Uint8Array(W * H * 3).map((_, i) => i * 7), { filter: (y) => y % 5 });
    expect(await decodePngAsync(bytes)).toEqual(decodePng(bytes, inflate));
  });

  it("says why it can't read one", () => {
    const err = (bytes: Uint8Array) => {
      try {
        decodePng(bytes, inflate);
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(err(new TextEncoder().encode("GIF89a, honest"))).toBe("not a PNG");
    expect(err(png(2, 2, 2, 16, new Uint8Array(24)))).toContain("save it with 8 bits a channel");
    expect(err(png(2, 2, 3, 8, new Uint8Array([0, 9, 1, 1]), { plte: [0, 1] }))).toContain("palette index 9 isn't in the palette");
  });
});

describe("the level format", () => {
  it("builds the painted materials into the world, with the level's seed", () => {
    const { level, errors } = parseLevel("good", { ...good, seed: 3 }, ground);
    expect(errors).toEqual([]);
    const a = level!.build(7), b = level!.build(99);
    expect([a.world.w, a.world.h]).toEqual([60, 30]);
    expect(a.world.get(5, 25)).toBe(M.rock);
    expect(a.world.get(5, 5)).toBe(M.air);
    // The scenario's seed doesn't change a painted level.
    expect(a.world.shade).toEqual(b.world.shade);
    expect(a.spawn).toEqual(good.spawn);
    expect([a.bits, a.lamps, a.checkpoints]).toEqual([[], [], []]);
  });

  it("fills in what's left out", () => {
    const { level } = parseLevel("good", { ...good, bits: [{ x: 5, y: 5 }], lamps: [{ x: 30, y: 5 }] }, ground);
    const b = level!.build(7);
    expect(b.bits).toEqual([{ x: 5, y: 5, r: 2 }]);
    expect(b.lamps).toEqual([{ x: 30, y: 5, color: [1, 0.82, 0.55], radius: 80 }]);
  });

  it("reads transparent pixels as air", () => {
    const img = image(60, 30, (_, y) => (y >= 20 ? M.rock : M.water));
    for (let i = 0; i < 60 * 20; i++) img.rgba[i * 4 + 3] = 0;
    expect(parseLevel("clear", good, img).level!.build(7).world.count(M.water)).toBe(0);
  });

  it("says what's wrong with a broken one", () => {
    const img = image(60, 30, (_, y) => (y >= 20 ? M.rock : M.air));
    img.rgba.set([1, 2, 3, 255], (25 * 60 + 7) * 4);
    img.rgba.set([1, 2, 3, 255], (26 * 60 + 7) * 4);
    const { level, errors } = parseLevel("bad", {
      title: "",
      spawn: { x: 10, y: 25 },
      checkpoints: [{ x: 80, y: 5 }, { x: 30, y: 22 }],
      bits: [{ x: 5, y: 5, r: -1 }],
      lamps: [{ x: 5, y: 5, color: "red" }],
      music: "loud",
    }, img);
    expect(level).toBeUndefined();
    expect(errors).toEqual([
      "materials.png: #010203 isn't a material's colour (2 pixels, the first at 7, 25): paint with the level palette",
      "music: not a field (title, seed, spawn, finish, checkpoints, bits, lamps)",
      "title: a non-empty string",
      "spawn: 10, 25 is inside something solid or liquid",
      "finish: missing (the box to get Bob into)",
      "checkpoints[0]: 80, 5 is off the map (60 × 30)",
      "checkpoints[1]: 30, 22 is inside something solid or liquid",
      "bits[0].r: a size in cells, more than 0",
      "lamps[0].color: [r, g, b], each 0 or more",
    ]);
  });

  it("wants a spawn and a finish on the map", () => {
    expect(parseLevel("x", { title: "X" }, ground).errors).toEqual(["spawn: missing (where Bob starts)", "finish: missing (the box to get Bob into)"]);
    expect(parseLevel("x", { ...good, spawn: { x: -1, y: 4 }, finish: { x0: 50, y0: 0, x1: 70, y1: 30 } }, ground).errors).toEqual([
      "spawn: -1, 4 is off the map (60 × 30)",
      "finish: reaches off the map (60 × 30)",
    ]);
    expect(parseLevel("x", [], ground).errors).toEqual(["level.json: not a JSON object"]);
  });
});

describe("level folders", () => {
  const folder = (files: Record<string, string | Uint8Array>) => {
    const dir = mkdtempSync(join(tmpdir(), "levels-"));
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    return dir;
  };
  const tinyPng = (w: number, h: number) => png(w, h, 3, 8, new Uint8Array(w * h).map((_, i) => ((i / w) | 0) >= h - 4 ? M.rock : M.air), { plte: [...PAINT] });

  it("load into LEVELS, and say what's wrong with the broken ones", () => {
    const dir = folder({
      "fine/level.json": JSON.stringify(good),
      "fine/materials.png": tinyPng(60, 30),
      "no-png/level.json": JSON.stringify(good),
      "half/level.json": '{ "title": ',
      "half/materials.png": "not a png",
    });
    const out = loadLevels(dir);
    expect(Object.fromEntries([...out].map(([id, r]) => [id, r.errors]))).toEqual({
      fine: [],
      half: [expect.stringMatching(/^level\.json: not JSON/), "materials.png: not a PNG"],
      "no-png": ["materials.png: missing"],
    });
    expect(LEVELS.fine.build(7).world.get(0, 29)).toBe(M.rock);
    expect(LEVELS["no-png"]).toBeUndefined();
  });

  it("are named in kebab-case", () => {
    const dir = folder({ "Big_One/level.json": JSON.stringify(good), "Big_One/materials.png": tinyPng(60, 30) });
    expect(readLevel(join(dir, "Big_One")).errors).toEqual(['the id "Big_One" (the folder name) isn\'t kebab-case']);
  });
});

describe("the tiny level", () => {
  it("loads from game/levels/ and plays: Bob lands on its ground", () => {
    loadLevels();
    const play = new Play({ id: "t", title: "T", level: "tiny", seed: 7, bob: { tweaks: {} }, camera: { zoom: 3, look: "day" } });
    expect(play.level.world.get(5, 41)).toBe(M.plant);
    expect(play.level.bits).toHaveLength(1);
    for (let i = 0; i < 90; i++) play.step({ move: 0, jump: false });
    const p = play.bob.main!;
    expect(Math.abs(p.cx - 20)).toBeLessThan(10);
    // Resting on the ground (its top at 40), not in it.
    const below = CAT[play.level.world.get(Math.round(p.cx), Math.round(p.cy) + 1)];
    expect(below === Cat.Empty || below === Cat.Gas).toBe(true);
    expect(p.cy).toBeLessThan(40);
    expect(p.cy).toBeGreaterThan(30);
  });
});

describe("painted ground", () => {
  // #35: painted grass used to sprout a stubble of blades up to 3 cells tall in its first
  // seconds, and Bob, rolling from rest, jammed against them.
  it("stays as painted: grass only grows where it drinks", () => {
    const lawn = image(60, 30, (_, y) => (y >= 23 ? M.dirt : y >= 20 ? M.plant : M.air));
    const { level } = parseLevel("good", good, lawn);
    const world = level!.build(7).world;
    const before = world.mat.slice();
    for (let i = 0; i < 300; i++) world.step();
    expect(world.mat).toEqual(before);
  });

  it("lets Bob roll from rest on the first Green level, holding right", () => {
    loadLevels();
    const scenario: Scenario = { id: "g", title: "G", level: "green-1-hills", seed: 7, bob: { tweaks: {} }, camera: { zoom: 3, look: "day" } };
    // The spawn on the flat, and two starts at the foot of a 0.47 slope (all three stalled before).
    const short: { at?: number; gone: number }[] = [];
    for (const at of [undefined, 695, 705]) {
      const play = new Play({ ...scenario, at });
      for (let i = 0; i < 60; i++) play.step({ move: 0, jump: false });
      const x0 = play.bob.main!.cx;
      for (let i = 0; i < 180; i++) play.step({ move: 1, jump: false });
      const gone = Math.round(play.bob.main!.cx - x0);
      // Rolling freely he goes about 120 to 170 cells in the 3 s; stalled, under 40.
      if (gone < 100) short.push({ at, gone });
    }
    expect(short).toEqual([]);
  });
});
