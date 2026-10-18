// Reads the painted levels in game/levels/ (or another folder) from disk and adds them to
// `LEVELS`, so a scenario in one plays in Node: the replays, the tests, the bots. The
// browser does the same in main.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { type Level, addLevel, parseLevel } from "../src/levels.ts";
import { decodePng } from "../src/png.ts";

export const LEVELS_DIR = fileURLToPath(new URL("../levels/", import.meta.url));

/** Reads one level folder: the level, or what's wrong with it. */
export function readLevel(dir: string): { level?: Level; w?: number; errors: string[] } {
  const id = dir.split(/[\\/]/).filter(Boolean).pop()!;
  const errors: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`the id "${id}" (the folder name) isn't kebab-case`);
  let raw: unknown, image;
  try {
    raw = JSON.parse(readFileSync(join(dir, "level.json"), "utf8"));
  } catch (e) {
    errors.push(`level.json: ${existsSync(join(dir, "level.json")) ? `not JSON (${(e as Error).message})` : "missing"}`);
  }
  try {
    image = decodePng(readFileSync(join(dir, "materials.png")), (z) => inflateSync(z));
  } catch (e) {
    errors.push(`materials.png: ${existsSync(join(dir, "materials.png")) ? (e as Error).message : "missing"}`);
  }
  if (errors.length || !image) return { errors };
  const r = parseLevel(id, raw, image);
  return { level: r.level, w: image.w, errors: r.errors };
}

/** Reads every level folder in `dir` and adds the good ones; what's wrong, by folder. */
export function loadLevels(dir = LEVELS_DIR): Map<string, { w?: number; errors: string[] }> {
  const out = new Map<string, { w?: number; errors: string[] }>();
  const ids = existsSync(dir) ? readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory()).sort() : [];
  for (const id of ids) {
    const { level, w, errors } = readLevel(join(dir, id));
    if (level) addLevel(id, level);
    out.set(id, { w, errors });
  }
  return out;
}
