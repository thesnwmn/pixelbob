import { M } from "./materials.ts";
import { fbm, hash2 } from "./noise.ts";
import { World } from "./world.ts";

export interface Lamp { x: number; y: number; color: [number, number, number]; radius: number }
export type Preset = "demo" | "rock";

const WARM: [number, number, number] = [1, 0.82, 0.55];

/**
 * Fill a world: hills with grass and trees over dirt and rock. "demo" adds
 * caves with a pond, a lava pocket, an ice cave, sand, oil and mine timbers;
 * "rock" is solid ground to dig into.
 */
export function generate(world: World, preset: Preset, seed: number): Lamp[] {
  const { w, h } = world;
  const surface = new Float32Array(w);
  for (let x = 0; x < w; x++) surface[x] = h * 0.26 + (fbm(x * 0.008, 0.5, seed, 4) - 0.5) * h * 0.22 + (fbm(x * 0.05, 3.5, seed + 1, 2) - 0.5) * 4;
  const lamps: Lamp[] = [];
  const set = (x: number, y: number, m: number) => {
    if (!world.inside(x, y)) return;
    const i = y * w + x;
    world.mat[i] = m;
    world.temp[i] = m === M.lava ? 1200 : m === M.ice || m === M.snow ? -15 : 20;
    world.aux[i] = 0;
    world.life[i] = 0;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = y - surface[x];
      world.back[y * w + x] = d > 2 ? 1 : 0;
      if (d < 0) { set(x, y, M.air); continue; }
      const soil = 10 + fbm(x * 0.04, 9, seed + 2, 2) * 12;
      let m: number = d < 1.5 ? M.plant : d < soil ? M.dirt : M.rock;
      if (m === M.rock && fbm(x * 0.03, y * 0.05, seed + 3, 3) > 0.66) m = M.stone;
      if (m === M.dirt && fbm(x * 0.1, y * 0.1, seed + 4, 2) > 0.7) m = M.rock;
      set(x, y, m);
    }
  // A couple of trees: wood trunks, leafy plant canopies.
  for (const tx of [w * 0.12, w * 0.7]) {
    const x0 = Math.round(tx), base = Math.round(surface[x0]);
    const th = 22 + Math.round(hash2(x0, 1, seed) * 10);
    for (let k = 0; k < th; k++) for (let o = 0; o < (k < 6 ? 3 : 2); o++) set(x0 + o, base - k, M.wood);
    for (let y = -14; y <= 10; y++)
      for (let x = -16; x <= 16; x++) {
        const r = Math.hypot(x / 16, y / 11) + (fbm((x0 + x) * 0.2, (base + y) * 0.2, seed + 5, 2) - 0.5) * 0.7;
        if (r < 1 && world.get(x0 + x, base - th + y) === M.air) set(x0 + x, base - th + y, M.plant);
      }
  }
  if (preset === "rock") return lamps;

  const carve = (cx: number, cy: number, rx: number, ry: number, rough = 0.5) => {
    for (let y = Math.floor(cy - ry * 1.5); y <= cy + ry * 1.5; y++)
      for (let x = Math.floor(cx - rx * 1.5); x <= cx + rx * 1.5; x++) {
        const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (fbm(x * 0.08, y * 0.08, seed + 6, 3) - 0.5) * rough * 2;
        if (e < 1) set(x, y, M.air);
      }
  };
  // Special pockets (pond, oil, lava, ice, sand) get a solid shell: noise caves keep clear of them.
  const px = Math.round(w * 0.3), py = Math.round(h * 0.68);
  const lx = Math.round(w * 0.78), ly = Math.round(h * 0.86);
  const ix = Math.round(w * 0.08), iy = Math.round(h * 0.55);
  const gx = Math.round(w * 0.6), gyc = Math.round(h * 0.74);
  const keepOut: [number, number, number, number][] = [[gx, gyc, 46, 20], [px, py + 4, 70, 30], [px + 70, py - 30, 26, 14], [lx, ly, 58, 24], [ix, iy, 44, 24], [w * 0.55, h * 0.5, 36, 18]];
  const kept = (x: number, y: number) => keepOut.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1);
  // Winding caves from noise, kept below the soil.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (y - surface[x] < 28 || kept(x, y)) continue;
      const n = fbm(x * 0.018, y * 0.032, seed + 7, 4);
      if (Math.abs(n - 0.5) < 0.035 + fbm(x * 0.05, y * 0.05, seed + 8, 2) * 0.03) set(x, y, M.air);
    }
  // Pond cave.
  carve(px, py, 42, 16);
  for (let y = py; y < py + 22; y++) for (let x = px - 60; x < px + 60; x++) if (world.get(x, y) === M.air) set(x, y, M.water);
  lamps.push({ x: px, y: py - 12, color: WARM, radius: 120 });
  // Mushroom grotto: a low cave with a damp dirt floor, a puddle and glowing mushrooms.
  carve(gx, gyc, 32, 10, 0.3);
  const floor = (x: number) => { let y = gyc; if (world.get(x, y) !== M.air) return h; while (y < h && world.get(x, y) === M.air) y++; return y; };
  for (let x = gx - 40; x < gx + 40; x++) {
    const f = floor(x);
    if (f >= h || f > gyc + 14) continue;
    for (let k = 0; k < 3; k++) set(x, f - 1 - k, M.dirt);
  }
  for (let x = gx + 8; x < gx + 18; x++) { const f = floor(x); if (f < h) set(x, f - 1, M.water); }
  for (const [dx, sh, r] of [[-22, 6, 2], [-14, 11, 4], [-6, 4, 2], [2, 8, 3], [24, 7, 3]] as const) {
    const x = gx + dx, f = floor(x);
    if (f >= h || world.get(x, f) !== M.dirt) continue;
    for (let k = 1; k <= sh; k++) set(x, f - k, M.stem);
    const top = f - sh - 1;
    for (let dy = -r; dy <= 0; dy++)
      for (let ex = -r - 1; ex <= r + 1; ex++)
        if ((ex * ex) / ((r + 1) * (r + 1)) + (dy * dy) / (r * r * 0.6) <= 1 && world.get(x + ex, top + dy) === M.air) set(x + ex, top + dy, M.cap);
  }

  // Oil seep above the pond.
  carve(px + 70, py - 30, 12, 6);
  for (let y = py - 30; y < py - 22; y++) for (let x = px + 55; x < px + 85; x++) if (world.get(x, y) === M.air) set(x, y, M.oil);
  // Lava pocket deep on the right.
  carve(lx, ly, 34, 11);
  for (let y = ly - 2; y < ly + 16; y++) for (let x = lx - 50; x < lx + 50; x++) if (world.get(x, y) === M.air) set(x, y, M.lava);
  // Ice cave on the left.
  carve(ix, iy, 26, 12);
  for (let y = iy - 20; y < iy + 20; y++)
    for (let x = ix - 40; x < ix + 40; x++) {
      if (world.get(x, y) !== M.air) continue;
      const below = world.get(x, y + 1), above = world.get(x, y - 1);
      if (below !== M.air && below !== M.snow && hash2(x, y, seed) < 0.9) set(x, y, M.snow);
      else if (above !== M.air && above !== M.ice && hash2(x, 3, seed) < 0.25) for (let k = 0; k < 2 + hash2(x, 4, seed) * 6; k++) if (world.get(x, y + k) === M.air) set(x, y + k, M.ice);
    }
  lamps.push({ x: ix + 4, y: iy - 6, color: [0.6, 0.8, 1], radius: 90 });
  // The ice cave is a cold biome: its air (and rock) stays well below freezing.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = ((x - ix) / 40) ** 2 + ((y - iy) / 22) ** 2;
      if (e < 1) { const i = y * w + x; world.base[i] = -12; world.temp[i] = -12; }
    }
  // A pocket of sand held up by rock, and a timbered mine shaft.
  carve(w * 0.55, h * 0.5, 22, 9);
  for (let y = Math.round(h * 0.5 - 12); y < h * 0.5 + 12; y++) for (let x = Math.round(w * 0.55 - 30); x < w * 0.55 + 30; x++) if (world.get(x, y) === M.air && y < h * 0.5) set(x, y, M.sand);
  const mx = Math.round(w * 0.46);
  for (let y = Math.round(surface[mx]) - 1; y < h * 0.62; y++) for (let x = mx - 5; x <= mx + 5; x++) set(x, y, M.air);
  for (let y = Math.round(surface[mx]) + 6; y < h * 0.62; y += 18) {
    for (let x = mx - 6; x <= mx + 6; x++) set(x, y, M.wood);
    for (let k = 1; k < 18; k++) { set(mx - 6, y + k, M.wood); set(mx + 6, y + k, M.wood); }
    for (let x = mx - 5; x <= mx + 5; x++) set(x, y, M.air);
    for (let x = mx - 5; x <= mx + 5; x++) set(x, y + 17, M.wood);
    set(mx - 2, y + 17, M.air); set(mx - 1, y + 17, M.air); set(mx, y + 17, M.air); set(mx + 1, y + 17, M.air); set(mx + 2, y + 17, M.air);
    lamps.push({ x: mx, y: y + 6, color: WARM, radius: 70 });
  }
  return lamps;
}
