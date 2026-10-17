import type { BobModel, BobView } from "@pixelbob/bob";
import { Buf, Kind } from "../../kit/buf.ts";
import { hex, mix, type RGB } from "../../kit/color.ts";
import { drawGrass, drawVine, grass, type Vine } from "../../kit/flora.ts";
import { motes, plume, shimmer } from "../../kit/fx.ts";
import { drawGoo, poseFrames } from "../../kit/goo.ts";
import type { PointLight } from "../../kit/light.ts";
import { MAT, paint } from "../../kit/materials.ts";
import { bottoms, disc, each, rim, tops } from "../../kit/paint.ts";
import { fbm, fbm1, hash2, rng } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
const TEAL = hex("#3ff0d8"), CYAN = hex("#6fd8ff"), VIOLET = hex("#a36bff"), WARM = hex("#ff9a4a");
const MOSS: RGB[][] = [
  ["#1d5f78", "#2a7fa0", "#3fa6c8"].map(hex),
  ["#1f6b4c", "#2c8d5c", "#45b06c"].map(hex),
  ["#4a2f7a", "#653fa0", "#8a5ad0"].map(hex),
];
/** The upper shelf Bob hangs from: top surface and the lip he goes over. */
const SHELF_Y = 64, LIP = 148;
/** The lower ledge with the lost bit, and the glowing pool under the thread. */
const LEDGE_Y = 128, LEDGE_X = 158, POOL_Y = 154;

/** Cave rock: > 0 is solid. */
function density(x: number, y: number, seed: number): number {
  const n = (fbm(x * 0.05, y * 0.05, seed, 3) - 0.5) * 6;
  // Ceiling with stalactites.
  const sta = Math.max(0, fbm1(x * 0.12, seed + 3, 2) - 0.5) * 60;
  if (y < 12 + n + sta * (x > 20 && x < 300 ? 1 : 0.3)) return 1;
  // Left wall.
  if (x < 14 + n + Math.max(0, (y - 120) * 0.25)) return 1;
  // Upper shelf: flat mossy top, overhanging lip, underside thinning toward the lip.
  const under = SHELF_Y + 10 + Math.max(0, (LIP - x) * 0.22) + n * 0.6;
  if (x < LIP + (fbm1(y * 0.3, seed + 5, 2) - 0.5) * 3 && y >= SHELF_Y + (fbm1(x * 0.2, seed + 6, 2) - 0.5) * 1.5 && y < under) return 1;
  // Lower ledge, part of the mass on the right, which steps down to a mushroom floor.
  let top: number;
  if (x < LEDGE_X) top = POOL_Y + 14;
  else if (x < 222) top = LEDGE_Y + (x - LEDGE_X < 2 ? 1 : 0);
  else if (x < 248) top = LEDGE_Y + (x - 222) * 0.9;
  else top = 152 + Math.sin(x * 0.08) * 2;
  if (x > 296 + n) top = Math.min(top, 40 + (320 - x) * 3);
  if (y > top + n * 0.4) return 1;
  // Pool basin floor.
  if (y > 172 + n * 0.5) return 1;
  return 0;
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
  for (let dx = -r + 1; dx < r; dx++) buf.glow(tx + dx, top + 1, mix(cap, [1, 1, 1], 0.4), 0.8);
}

function crystal(buf: Buf, x: number, y: number, len: number, ang: number, wdt: number, seed: number): void {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let s = 0; s < len; s++) {
    const half = wdt * (1 - s / len);
    for (let o = -half; o <= half; o += 0.5) {
      const px = x + dx * s - dy * o, py = y + dy * s + dx * o;
      paint(buf, px, py, MAT.crystal, (o < 0 ? 0.6 : 0.25) + (s / len) * 0.3, seed, 0.3);
    }
  }
}

/** A posed piece drawn without eyes (a lost bit is not "you"). */
const eyeless = (v: BobView): BobView => ({ ...v, pieces: [{ ...v.pieces[0], len: 0 }, ...v.pieces] });

export const caverns: SceneDef = {
  id: "caverns",
  title: "Glow Caverns",
  blurb: "Warmed runny by a hot spring, Bob lowers himself on a thread toward a lost bit of himself. Too far, and a drop falls.",
  notes: [
    "The puzzle: the bit is on a ledge he can't jump down to without falling in the pool. Runny and holding still, he tenses and hangs; down lowers him on a thread.",
    "The tension is the thread: reach a little further and a drop breaks off into the goo. Pull back up in time and you keep it.",
    "Why he's runny: the hot spring on the shelf behind him. Its warm light is the one warm colour in the cave, so it reads as the source.",
    "Light story: teal from the pool and mushrooms, violet from the crystals; Bob is the only warm thing on screen, which is what keeps him readable here.",
    "Every glowing pixel is an emitter feeding bloom; the rock only shows where something lights it.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    each(buf, (x, y) => {
      if (density(x, y, seed) > 0) {
        paint(buf, x, y, MAT.stone, 0.45 + fbm(x * 0.08, y * 0.08, seed + 1) * 0.3, seed);
      } else {
        const n = fbm(x * 0.04, y * 0.06, seed + 2, 4);
        const c = mix(hex("#1a1e28"), hex("#323a4c"), n);
        buf.set(x, y, mix(c, hex("#103036"), Math.max(0, (y - 90) / 120)), Kind.Back, 0);
      }
    });
    // Glow goo pool below the thread.
    for (let x = 0; x < LEDGE_X; x++)
      for (let y = POOL_Y; y < H && !buf.solidAt(x, y); y++)
        paint(buf, x, y, MAT.goo, 0.2 + (y === POOL_Y ? 0.8 : (1 - (y - POOL_Y) / 20) * 0.4), seed, y === POOL_Y ? 0.9 : 0.25);
    rim(buf, hex("#6a7590"), 0.4, 2);

    // Moss on top surfaces, coloured by region.
    const surf = tops(buf).filter((p) => buf.kindAt(p.x, p.y - 1) === Kind.Back);
    for (const p of surf) {
      const region = p.y < 100 ? 0 : p.x > 240 ? 2 : 1;
      const ramp = MOSS[region];
      const th = hash2(p.x, p.y, seed) < 0.7 ? 2 : 1;
      for (let k = 0; k < th; k++) {
        buf.set(p.x, p.y + k, ramp[2 - k], Kind.Solid, 0.4);
        if (region !== 1) buf.glow(p.x, p.y + k, ramp[2], 0.1);
      }
    }
    const tufts = grass(surf.filter((p) => Math.abs(p.x - 120) > 26), seed + 3, { density: 0.35, height: 3, ramp: MOSS[0] });

    const r = rng(seed + 9);
    const lights: PointLight[] = [];
    const ground = (x: number, from = 100) => { for (let y = from; y < H; y++) if (buf.solidAt(x, y)) return y; return H; };

    // Hot spring on the shelf, behind Bob: a little steaming pool with a warm glow.
    const SPRING_X = 52;
    for (let x = SPRING_X - 9; x <= SPRING_X + 9; x++)
      for (let y = SHELF_Y; y < SHELF_Y + 3; y++) {
        if (y === SHELF_Y + 2 && Math.abs(x - SPRING_X) > 6) continue;
        paint(buf, x, y, MAT.water, 0.6, seed);
        buf.set(x, y, mix(hex("#3a8aa0"), hex("#ffb070"), y === SHELF_Y ? 0.35 : 0.15), Kind.Fluid, 0.1);
        buf.glow(x, y, WARM, y === SHELF_Y ? 0.7 : 0.3);
      }
    lights.push({ x: SPRING_X, y: SHELF_Y - 5, color: WARM, radius: 95, intensity: 1.5, flicker: 0.15 });

    // Mushrooms on the lower ledge and the floor to the right.
    const shrooms: [number, number, number, RGB][] = [[202, 18, 6, TEAL], [214, 10, 4, CYAN], [252, 24, 7, TEAL], [265, 12, 4, CYAN], [274, 8, 3, TEAL], [24, 7, 3, CYAN]];
    for (const [x, h, rr, c] of shrooms) {
      const g = x < 30 ? ground(x, SHELF_Y - 4) : ground(x);
      if (g >= H) continue;
      mushroom(buf, x, g - 1, h, rr, c, x, (r() - 0.5) * 3);
      lights.push({ x, y: g - h + 2, color: c, radius: 24 + rr * 8, intensity: 0.45 + rr * 0.06, flicker: 0.12 });
    }
    // Crystal cluster on the right wall.
    // Crystals in the corner where the floor meets the right wall, pointing up and out.
    const CRY: [number, number, number, number][] = [[294, 32, -2.0, 4], [288, 20, -1.75, 2.8], [299, 18, -2.5, 2.6], [283, 10, -1.45, 1.8], [291, 12, -2.3, 1.8]];
    for (const [cx, len, ang, wd] of CRY) crystal(buf, cx, ground(cx, 140) + 1, len, ang, wd, seed + cx);
    lights.push({ x: 286, y: 136, color: VIOLET, radius: 130, intensity: 1.7 });
    // The pool lights the shelf's underside and the thread.
    for (const x of [30, 80, 130]) lights.push({ x, y: POOL_Y - 3, color: TEAL, radius: 95, intensity: 1, flicker: 0.1 });

    // Vines from the ceiling and the shelf's underside.
    const vines: Vine[] = bottoms(buf)
      .filter((p) => hash2(p.x, p.y, seed) < 0.07 && Math.abs(p.x - LIP) > 10 && p.x < 290)
      .map((p, i) => ({ x: p.x, y: p.y, len: 6 + Math.floor(hash2(p.x, 1, seed) * (p.y < 40 ? 26 : 14)), seed: i, bulb: i % 3 === 0 ? (i % 2 ? TEAL : CYAN) : undefined }));
    for (const v of vines) if (v.bulb) lights.push({ x: v.x, y: v.y + v.len, color: v.bulb, radius: 30, intensity: 0.45 });
    const VINE = ["#1d4f45", "#26685a", "#2f8270"].map(hex);

    // Bob: runny, pushed out over the lip until his front is past it, then held still. He
    // tenses and hangs on a thread; a drop has just pulled away into the pool.
    const RX = 70, RY = 30;
    const front = (b: BobModel) => { const v = b.view(), p = v.pieces[0]; let x1 = -Infinity; for (let k = p.start; k < p.start + p.len; k++) x1 = Math.max(x1, v.x[v.order[k]]); return x1; };
    let go = true;
    // Pushed 8 px past the lip and left alone, he hangs; ~5 s in, the thread is at its longest just before it snaps.
    const REACH = 8;
    const bob = poseFrames(buf, {
      x: 118, y: SHELF_Y - 11, temp: 62, region: [RX, RY, 180, 150],
      each: (f) => { if (f === 0) go = true; },
      input: (_f, b) => { if (front(b) > LIP - RX + REACH) go = false; return { move: go ? 1 : 0, jump: false }; },
    }, [290])[0];
    // The lost bit, at room temperature, on the lower ledge.
    const BIT_X = 168;
    const bit = eyeless(poseFrames(buf, { x: BIT_X, y: LEDGE_Y - 5, tweaks: { size: 4 }, region: [BIT_X - 20, LEDGE_Y - 30, 40, 40] }, [40])[0]);
    lights.push({ x: BIT_X, y: LEDGE_Y - 8, color: hex("#ffb0c0"), radius: 18, intensity: 0.35 });
    // A drop from an earlier reach, falling into the pool.
    const drop = eyeless(poseFrames(buf, { x: 132, y: 128, temp: 62, tweaks: { size: 2 }, region: [112, 100, 40, 60] }, [6])[0]);

    return {
      buf,
      lights,
      ambient: [0.04, 0.05, 0.08],
      depth: { fade: 10, min: 0.04 },
      backLit: 0.6,
      grade: { tint: [0.95, 1.02, 1.08], vignette: 0.45, bloom: 1.1, threshold: 0.7 },
      frame(b, t) {
        drawGrass(b, tufts, t, 0.15, 0.05);
        for (const v of vines) drawVine(b, v, t, VINE, 0.5);
        shimmer(b, 0, LEDGE_X - 1, POOL_Y, t, seed, hex("#d8fff6"), 0.8);
        plume(b, SPRING_X, SHELF_Y - 1, 40, t, seed + 4, ["#c8a890", "#e8d0c0"].map(hex), 0.28, 0.5, 6);
        // Rings where the drop went in.
        const age = (t * 0.6) % 1, rr = Math.floor(age * 7);
        for (const s of [-1, 1]) for (let k = 0; k < 2; k++) b.blend(132 + s * (rr + 1) + s * k, POOL_Y, hex("#e8fff8"), 0.7 * (1 - age));
        // Goo bubbles in the pool.
        for (let i = 0; i < 3; i++) {
          const a = (t * 0.5 + i * 0.33) % 1, bx = 40 + i * 34;
          disc(bx, POOL_Y - Math.sin(a * Math.PI) * 2, a < 0.9 ? 1 : 0, (x, y) => { b.set(x, y, MAT.goo.ramp[2], Kind.Fluid, 0.1); b.glow(x, y, TEAL, 1); });
        }
        drawGoo(b, bit, { palette, t, selfLit: 1.6 });
        drawGoo(b, drop, { palette, t, selfLit: 1.6 });
        drawGoo(b, bob, { palette, t, selfLit: 1.6 });
        motes(b, 26, t, seed, [20, 20, 280, 120], CYAN, 0.9, 5);
        motes(b, 8, t, seed + 1, [260, 60, 60, 80], VIOLET, 0.9, 3);
      },
    };
  },
};
