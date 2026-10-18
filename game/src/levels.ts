// The levels a scenario can start in: Bob's test course, built in code, and the painted
// levels in game/levels/, each a folder with `materials.png` (the material layer, in the
// palette `PAINT` in packages/sim) and `level.json` (what's in it). See
// docs/tech-and-toolchain.md#level-format. No DOM, so a scenario runs in Node too: the
// browser (main.ts) and Node (scripts/load-levels.ts) each read the files and `addLevel` them.
import { COURSE_H, COURSE_W, buildCourse, sectionAt } from "@pixelbob/bob";
import { CAT, Cat, type Lamp, M, World, paintedMaterial } from "@pixelbob/sim";
import type { Image } from "./png.ts";

type Point = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** A level, built into a world. */
export interface Built {
  world: World;
  lamps: Lamp[];
  spawn: Point;
  /** Stranded bits of Bob to collect. */
  bits: { x: number; y: number; r: number }[];
  /** Get as much of Bob into this box as you can. */
  finish: Box;
  /** Where Bob can come back to (not yet used: the checkpoints unit). */
  checkpoints: Point[];
  /** What the bit of the level at `x` is for, if anything. */
  note(x: number): string;
}

export interface Level {
  title: string;
  build(seed: number): Built;
}

/** By id: the ones a scenario can name are `LEVEL_IDS` in scenario.ts (a test keeps them in step). */
export const LEVELS: Record<string, Level> = {
  course: {
    title: "Bob's test course",
    build(seed) {
      const world = new World(COURSE_W, COURSE_H, seed);
      const course = buildCourse(world, seed);
      return {
        world,
        lamps: course.lamps,
        spawn: course.spawn,
        bits: course.bits,
        finish: course.finish,
        checkpoints: [],
        note(x) {
          const s = sectionAt(course, x);
          return s ? `${s.name}: ${s.note}` : "";
        },
      };
    },
  },
};

export function addLevel(id: string, level: Level): void {
  LEVELS[id] = level;
}

/** A painted level's `level.json`. Positions are in cells, from the top left. */
export interface LevelFile {
  title: string;
  /** The world's seed: a painted level is the same world whichever scenario starts in it. */
  seed: number;
  spawn: Point;
  finish: Box;
  checkpoints: Point[];
  /** Lost bits of Bob, r cells across. */
  bits: { x: number; y: number; r: number }[];
  lamps: Lamp[];
}

const WARM: [number, number, number] = [1, 0.82, 0.55];

/**
 * A painted level from its files (the PNG already decoded): the level, or everything
 * that's wrong with it. The world's seed is the level's, not the scenario's.
 */
export function parseLevel(id: string, raw: unknown, image: Image): { level?: Level; file?: LevelFile; errors: string[] } {
  const errors: string[] = [];
  const bad = (msg: string) => errors.push(msg);
  const { w, h } = image;

  // The material layer: every pixel a palette colour, or transparent for air.
  const mat = new Uint8Array(w * h);
  const unknown = new Map<number, { n: number; x: number; y: number }>();
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (image.rgba[o + 3] === 0) continue;
    const rgb = (image.rgba[o] << 16) | (image.rgba[o + 1] << 8) | image.rgba[o + 2];
    const m = paintedMaterial(rgb);
    if (m >= 0) mat[i] = m;
    else {
      const u = unknown.get(rgb);
      if (u) u.n++;
      else unknown.set(rgb, { n: 1, x: i % w, y: (i / w) | 0 });
    }
  }
  for (const [rgb, u] of unknown) bad(`materials.png: #${rgb.toString(16).padStart(6, "0")} isn't a material's colour (${u.n} pixel${u.n === 1 ? "" : "s"}, the first at ${u.x}, ${u.y}): paint with the level palette`);

  if (!isObject(raw)) return { errors: [...errors, "level.json: not a JSON object"] };
  unknownKeys(raw, ["title", "seed", "spawn", "finish", "checkpoints", "bits", "lamps"], "", bad);
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const onMap = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const point = (v: unknown, at: string, extra: string[] = []): Point | undefined => {
    if (!isObject(v) || !num(v.x) || !num(v.y)) return void bad(`${at}: { "x": cells across, "y": cells down }`);
    unknownKeys(v, ["x", "y", ...extra], `${at}.`, bad);
    const p = { x: v.x as number, y: v.y as number };
    if (!onMap(p.x, p.y)) return void bad(`${at}: ${p.x}, ${p.y} is off the map (${w} × ${h})`);
    return p;
  };
  const list = <T>(k: string, each: (v: unknown, at: string) => T | undefined): T[] => {
    const v = raw[k] ?? [];
    if (!Array.isArray(v)) return bad(`${k}: a list`), [];
    return v.map((e, i) => each(e, `${k}[${i}]`)).filter((e): e is T => e !== undefined);
  };

  const title = raw.title;
  if (typeof title !== "string" || !title.trim()) bad("title: a non-empty string");
  const seed = raw.seed ?? 7;
  if (!Number.isInteger(seed)) bad("seed: an integer");

  let spawn: Point | undefined;
  if (raw.spawn === undefined) bad("spawn: missing (where Bob starts)");
  else spawn = point(raw.spawn, "spawn");
  if (spawn) {
    const c = CAT[mat[Math.floor(spawn.y) * w + Math.floor(spawn.x)]];
    if (c !== Cat.Empty && c !== Cat.Gas) bad(`spawn: ${spawn.x}, ${spawn.y} is inside something solid or liquid`);
  }

  let finish: Box | undefined;
  const f = raw.finish;
  if (f === undefined) bad("finish: missing (the box to get Bob into)");
  else if (!isObject(f) || ![f.x0, f.y0, f.x1, f.y1].every(num) || !((f.x0 as number) < (f.x1 as number) && (f.y0 as number) < (f.y1 as number)))
    bad('finish: { "x0", "y0", "x1", "y1" }, the box\'s corners, with x0 < x1 and y0 < y1');
  else {
    unknownKeys(f, ["x0", "y0", "x1", "y1"], "finish.", bad);
    finish = { x0: f.x0 as number, y0: f.y0 as number, x1: f.x1 as number, y1: f.y1 as number };
    if (finish.x0 < 0 || finish.y0 < 0 || finish.x1 > w || finish.y1 > h) bad(`finish: reaches off the map (${w} × ${h})`);
  }

  const checkpoints = list("checkpoints", (v, at) => point(v, at));
  const bits = list("bits", (v, at) => {
    const p = point(v, at, ["r"]);
    const r = isObject(v) ? (v.r ?? 2) : 2;
    if (!num(r) || (r as number) <= 0) return void bad(`${at}.r: a size in cells, more than 0`);
    return p && { ...p, r: r as number };
  });
  const lamps = list("lamps", (v, at): Lamp | undefined => {
    const p = point(v, at, ["color", "radius"]);
    if (!isObject(v)) return;
    const color = v.color ?? WARM, radius = v.radius ?? 80;
    if (!Array.isArray(color) || color.length !== 3 || !color.every((c) => num(c) && c >= 0)) return void bad(`${at}.color: [r, g, b], each 0 or more`);
    if (!num(radius) || (radius as number) <= 0) return void bad(`${at}.radius: in cells, more than 0`);
    return p && { ...p, color: color as [number, number, number], radius: radius as number };
  });

  if (errors.length || !spawn || !finish) return { errors };
  const file: LevelFile = { title: title as string, seed: seed as number, spawn, finish, checkpoints, bits, lamps };
  return {
    file,
    errors,
    level: {
      title: file.title,
      build() {
        const world = new World(w, h, file.seed);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mat[y * w + x] !== M.air) world.set(x, y, mat[y * w + x]);
        world.wakeAll();
        const copy = <T extends object>(a: T[]) => a.map((e) => ({ ...e }));
        return { world, lamps: copy(file.lamps), spawn: { ...file.spawn }, bits: copy(file.bits), finish: { ...file.finish }, checkpoints: copy(file.checkpoints), note: () => "" };
      },
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unknownKeys(o: Record<string, unknown>, known: string[], prefix: string, bad: (msg: string) => void) {
  for (const k of Object.keys(o)) if (!known.includes(k)) bad(`${prefix}${k}: not a field (${known.join(", ")})`);
}
