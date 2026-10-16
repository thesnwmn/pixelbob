import { Buf, Kind } from "../kit/buf.ts";
import { drawBob, idleBob } from "../kit/bob.ts";
import { hex, mix, type RGB } from "../kit/color.ts";
import { drawGrass, drawVine, grass, type Vine } from "../kit/flora.ts";
import { motes, shimmer } from "../kit/fx.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint } from "../kit/materials.ts";
import { bottoms, disc, each, rim, tops } from "../kit/paint.ts";
import { fbm, fbm1, hash2, rng } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270;
const TEAL = hex("#3ff0d8"), CYAN = hex("#6fd8ff"), VIOLET = hex("#a36bff");
const MOSS: RGB[][] = [
  ["#1d5f78", "#2a7fa0", "#3fa6c8"].map(hex),
  ["#1f6b4c", "#2c8d5c", "#45b06c"].map(hex),
  ["#4a2f7a", "#653fa0", "#8a5ad0"].map(hex),
];
const POOL_Y = 226;

/** Cave rock density: > 0 is solid. One big chamber, a mound, a basin on the left, stalactites. */
function density(x: number, y: number, seed: number): number {
  const cx = (x - 240) / 250, cy = (y - 140) / 105;
  let d = cx * cx * 0.6 + cy * cy - 0.75;
  d += (fbm(x * 0.014, y * 0.022, seed, 5) - 0.5) * 1.1;
  d -= Math.exp(-(((x - 110) / 70) ** 2)) * Math.max(0, (y - 180) / 60) * 0.5; // basin
  d += Math.exp(-(((x - 300) / 60) ** 2)) * Math.max(0, (y - 170) / 30) * 0.55; // mound
  const lx = (x - 150) / 70, ly = (y - 128) / 7;
  if (lx * lx + ly * ly < 1.6) d = Math.max(d, 1 - lx * lx - Math.max(0, ly) * ly * 0.4 - Math.max(0, -ly) * 2 + (fbm(x * 0.1, y * 0.1, seed + 8) - 0.5)); // ledge
  const sta = fbm1(x * 0.09, seed + 3, 2);
  d += Math.max(0, sta - 0.55) * 4 * Math.max(0, 1 - Math.abs(y - 55) / 40) * (y < 100 ? 1 : 0); // stalactites
  return d;
}

function mushroom(buf: Buf, x: number, y: number, h: number, r: number, cap: RGB, seed: number, lean: number): void {
  const stem = hex("#a8c4bc");
  let tx = x;
  for (let k = 0; k < h; k++) {
    tx = x + Math.round(Math.sin((k / h) * 2 + seed) * lean);
    buf.set(tx, y - k, mix(stem, hex("#5f7a74"), hash2(k, seed, 1) * 0.4), Kind.Object, 0.05);
    if (r > 3) buf.set(tx + 1, y - k, mix(stem, hex("#5f7a74"), 0.5), Kind.Object, 0.05);
  }
  const top = y - h;
  for (let dy = -r; dy <= 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const e = (dx * dx) / ((r + 1) * (r + 1)) + (dy * dy) / (r * r * 0.55);
      if (e > 1 || (dy === 1 && Math.abs(dx) < r - 1)) continue;
      const spot = hash2(dx + x, dy + top, seed) < 0.12;
      const c = dy === 1 || e > 0.8 ? mix(cap, hex("#0d3e44"), 0.5) : spot ? mix(cap, [1, 1, 1], 0.6) : dy < -r * 0.4 ? mix(cap, [1, 1, 1], 0.25) : cap;
      buf.set(tx + dx, top + dy, c, Kind.Object, 0);
      buf.glow(tx + dx, top + dy, cap, dy === 1 ? 0.9 : 0.45);
    }
  // Gills glow brightest.
  for (let dx = -r + 1; dx < r; dx++) buf.glow(tx + dx, top + 1, mix(cap, [1, 1, 1], 0.4), 0.8);
}

function crystal(buf: Buf, x: number, y: number, len: number, ang: number, wdt: number, seed: number): void {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let s = 0; s < len; s++) {
    const half = wdt * (1 - s / len);
    for (let o = -half; o <= half; o += 0.5) {
      const px = x + dx * s - dy * o, py = y + dy * s + dx * o;
      const facet = o < 0 ? 0.65 : 0.35;
      paint(buf, px, py, MAT.crystal, facet + (s / len) * 0.3, seed, 0.55);
    }
  }
}

export const cavern: SceneDef = {
  id: "cavern",
  title: "Glow cavern",
  blurb: "Bioluminescent mushrooms, a pool of glow goo, crystals and drifting spores.",
  notes: [
    "Darkness is the default underground; colour comes almost entirely from emissive materials.",
    "Every glowing pixel feeds the bloom; bigger emitters also cast real light with soft shadows.",
    "Moss colour drifts across regions (teal, green, violet) to give caves identity without new tiles.",
    "Glow goo is a liquid: Bob could absorb it and become a light source (puzzle idea).",
  ],
  w: W,
  h: H,
  focus: [0.6, 0.62],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    each(buf, (x, y) => {
      const d = density(x, y, seed);
      if (d > 0) {
        paint(buf, x, y, MAT.stone, 0.45 + fbm(x * 0.06, y * 0.06, seed + 1) * 0.3, seed);
      } else {
        const n = fbm(x * 0.03, y * 0.05, seed + 2, 4);
        const c = mix(hex("#1e222c"), hex("#363c4e"), n);
        buf.set(x, y, mix(c, hex("#123238"), Math.max(0, (y - 150) / 200)), Kind.Back, 0);
      }
    });
    // Glow goo pool in the basin.
    for (let x = 0; x < 230; x++)
      for (let y = POOL_Y; y < H && !buf.solidAt(x, y); y++) {
        paint(buf, x, y, MAT.goo, 0.2 + (y === POOL_Y ? 0.8 : (1 - (y - POOL_Y) / 30) * 0.4), seed, y === POOL_Y ? 0.9 : 0.22);
      }
    rim(buf, hex("#6a7590"), 0.4, 2);

    // Moss on every top surface, coloured by region.
    const surf = tops(buf).filter((p) => buf.kindAt(p.x, p.y - 1) === Kind.Back);
    for (const p of surf) {
      const region = Math.floor(fbm1(p.x * 0.01, seed + 5) * 3.2) % 3;
      const ramp = MOSS[region];
      const th = hash2(p.x, p.y, seed) < 0.7 ? 2 : 1;
      for (let k = 0; k < th; k++) {
        buf.set(p.x, p.y + k, ramp[2 - k], Kind.Solid, 0.4);
        if (region !== 1) buf.glow(p.x, p.y + k, ramp[2], 0.12);
      }
    }
    const tufts = grass(surf, seed + 3, { density: 0.35, height: 3, ramp: MOSS[0] });

    const r = rng(seed + 9);
    const lights: PointLight[] = [];
    const ground = (x: number) => { for (let y = 120; y < H; y++) if (buf.solidAt(x, y)) return y; return H; };
    // Mushrooms on the mound and along the floor.
    const shrooms: [number, number, number, RGB][] = [[318, 34, 10, TEAL], [340, 20, 6, CYAN], [298, 14, 5, TEAL], [356, 10, 4, CYAN], [384, 16, 5, TEAL], [130, 9, 4, CYAN], [168, 6, 3, TEAL], [405, 24, 7, TEAL]];
    for (const [x, h, rr, c] of shrooms) {
      const g = ground(x);
      if (g >= H) continue;
      mushroom(buf, x, g - 1, h, rr, c, x, (r() - 0.5) * 4);
      lights.push({ x, y: g - h + 3, color: c, radius: 30 + rr * 10, intensity: 0.45 + rr * 0.06, flicker: 0.15 });
    }
    // Crystal cluster on the right wall.
    for (let i = 0; i < 9; i++) { const cx = 438 + r() * 30; crystal(buf, cx, ground(cx) + 2, 8 + r() * 22, -Math.PI / 2 + (r() - 0.5) * 1.1, 1.5 + r() * 2.5, seed + i); }
    lights.push({ x: 452, y: ground(452) - 18, color: VIOLET, radius: 150, intensity: 1.8 });
    // The pool lights the basin.
    for (let x = 30; x < 220; x += 45) if (!buf.solidAt(x, POOL_Y)) lights.push({ x, y: POOL_Y - 2, color: TEAL, radius: 90, intensity: 0.8, flicker: 0.1 });

    const vines: Vine[] = bottoms(buf)
      .filter((p) => p.y < 120 && hash2(p.x, p.y, seed) < 0.06)
      .map((p, i) => ({ x: p.x, y: p.y, len: 10 + Math.floor(hash2(p.x, 1, seed) * 30), seed: i, bulb: i % 3 === 0 ? (i % 2 ? TEAL : CYAN) : undefined }));
    for (const v of vines) if (v.bulb) lights.push({ x: v.x, y: v.y + v.len, color: v.bulb, radius: 40, intensity: 0.5 });
    const VINE = ["#1d4f45", "#26685a", "#2f8270"].map(hex);
    const bobX = 272, bobG = (x: number) => ground(x);

    return {
      buf,
      lights,
      ambient: [0.05, 0.06, 0.09],
      depth: { fade: 12, min: 0.04 },
      backLit: 0.6,
      grade: { tint: [0.95, 1.02, 1.08], vignette: 0.45, bloom: 1.1, threshold: 0.7 },
      frame(b, t) {
        drawGrass(b, tufts, t, 0.15, 0.05);
        for (const v of vines) drawVine(b, v, t, VINE, 0.5);
        shimmer(b, 0, 230, POOL_Y, t, seed, hex("#d8fff6"), 0.8);
        // Goo blobs bubble up from the pool.
        for (let i = 0; i < 4; i++) {
          const age = (t * 0.5 + i * 0.27) % 1, bx = 50 + i * 40;
          if (!b.solidAt(bx, POOL_Y)) disc(bx, POOL_Y - Math.sin(age * Math.PI) * 3, age < 0.9 ? 1 : 0, (x, y) => { b.set(x, y, MAT.goo.ramp[2], Kind.Fluid, 0.1); b.glow(x, y, TEAL, 1); });
        }
        drawBob(b, idleBob(bobX, bobG, 12, t), { palette, t, selfLit: 0.22, eyes: { x: bobX + 2, y: ground(bobX) - 15, look: 1, size: 2 } });
        motes(b, 40, t, seed, [0, 60, W, 180], CYAN, 0.9, 5);
        motes(b, 12, t, seed + 1, [380, 100, 100, 100], VIOLET, 0.9, 3);
      },
    };
  },
};
