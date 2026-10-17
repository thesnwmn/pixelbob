import { M } from "@pixelbob/sim";
import { Buf, Kind } from "../../kit/buf.ts";
import { hex, mix, type RGB } from "../../kit/color.ts";
import { drawGrass, drawVine, grass, type Vine } from "../../kit/flora.ts";
import { motes } from "../../kit/fx.ts";
import type { BobView, Piece } from "@pixelbob/bob";
import { drawGoo, poseFrames } from "../../kit/goo.ts";
import type { PointLight } from "../../kit/light.ts";
import { MAT, paint, type Material } from "../../kit/materials.ts";
import { bottoms, rect, tops } from "../../kit/paint.ts";
import { fbm, hash2 } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
const FLOOR = 160;
/** The gum pillar Bob climbs: its left face, and the carved ledge on top. */
const GUM_X = 132, GUM_W = 34, GUM_TOP = 52;
/** Holes in the roof the sun comes through: a wide one onto the pillar, a narrow one onto the resin. */
const HOLES: [number, number][] = [[62, 98], [200, 222]];
const inHole = (x: number) => HOLES.some(([a, b]) => x > a && x < b);
const SUN = hex("#ffd88a"), CANOPY = hex("#7fd860"), AMBER = hex("#ffa030"), VIOLET = hex("#9a60ff");

/** Carved temple stone, tinted green with age; mortar lines between blocks. */
function stone(buf: Buf, x: number, y: number, seed: number, kind: number, dark = 0): void {
  const bw = 14, bh = 8;
  const row = Math.floor(y / bh), off = (row % 2) * 7;
  const bx = Math.floor((x + off) / bw);
  const mortar = (y % bh === 0) || ((x + off) % bw === 0);
  const age = fbm(x * 0.05, y * 0.05, seed + 3, 3);
  const base = mix(hex("#4a4a3e"), hex("#5c5a48"), hash2(bx, row, seed));
  let c = mix(base, hex("#38503a"), Math.max(0, age - 0.35) * 1.4);
  c = mix(c, [0, 0, 0], (hash2(x, y, seed) - 0.5) * 0.12 + dark);
  if (mortar) c = mix(c, hex("#1a1c16"), 0.6);
  if (kind === Kind.Solid) buf.set(x, y, c, Kind.Solid, 0.55);
  else buf.set(x, y, c, Kind.Back, 0);
}

export const ruins: SceneDef = {
  id: "ruins",
  title: "Sticky Ruins",
  blurb: "World 3: an overgrown temple where the walls are sticky, and the colour of a wall tells you how well it grips.",
  notes: [
    "The puzzle: the lost bit is on top of the pillar. Violet gum holds him on a sheer wall if he pushes in; up climbs. The amber resin route on the right is gentler but only holds while he pushes in.",
    "Climbing sheds a few crumbs (falling here): a clean, decisive climb brings more of Bob home.",
    "Light story: cool green canopy light everywhere, one warm sun shaft through a hole in the roof landing on the resin, which glows amber.",
    "Bob is the real goo, simulated climbing the gum: he hangs like a drop, weight at the bottom, flat against the wall.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    const sim = new Uint8Array(W * H);
    const solid = (x: number, y: number, mat: Material | null, m: number, shade = 0.5, glowK = 0) => {
      if (!buf.inside(x, y)) return;
      if (mat) paint(buf, x, y, mat, shade, seed, glowK);
      else stone(buf, x, y, seed, Kind.Solid);
      sim[y * W + x] = m;
    };

    // Back wall: carved blocks, darker high up, with a doorway arch in the middle distance.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        stone(buf, x, y, seed + 1, Kind.Back, 0.25 + Math.max(0, (60 - y) / 200));
        const ax = (x - 92) / 22, ay = (y - 128) / 46;
        if (ax * ax + Math.min(0, ay) ** 2 * 1.2 < 1 && y > 82 && y < FLOOR && Math.abs(ax) < 1) buf.set(x, y, mix(hex("#0c120c"), hex("#18241a"), (y - 82) / 80), Kind.Back, 0);
      }

    // Ceiling: overgrown roof slabs across the top, with the hole the sun comes through.
    for (let x = 0; x < W; x++) {
      const depth = inHole(x) ? 0 : 12 + Math.round(fbm(x * 0.04, 2, seed, 3) * 10) + (x < 40 ? 8 : 0);
      for (let y = 0; y < depth; y++) solid(x, y, null, M.rock);
    }
    // The temple's left wall, full height (it also keeps the low sun out of the left side).
    rect(0, 0, 8, H, (x, y) => solid(x, y, null, M.rock));
    // Floor: big slabs, with moss on top.
    for (let x = 0; x < W; x++) for (let y = FLOOR; y < H; y++) solid(x, y, null, M.rock);
    // Left: stepped moss ledges (moss is grippy ground, not a wall).
    const steps: [number, number, number][] = [[0, 40, 118], [0, 22, 82]];
    for (const [x0, w, y0] of steps) rect(x0, y0, w, 8, (x, y) => solid(x, y, null, M.rock));
    // Gum pillar: a carved column smothered in violet gum on its faces, ledge on top.
    rect(GUM_X, GUM_TOP, GUM_W, FLOOR - GUM_TOP, (x, y) => {
      const face = Math.min(x - GUM_X, GUM_X + GUM_W - 1 - x);
      const lump = Math.round(fbm(y * 0.09, x * 0.02, seed + 9, 2) * 6);
      if (face < 4 + lump) {
        solid(x, y, MAT.gum, M.gum, face === 0 ? 0.98 : face === 1 ? 0.85 : 0.7 - face * 0.03);
        buf.glow(x, y, VIOLET, face < 2 ? 0.16 : 0.07);
      }
      else solid(x, y, null, M.rock);
    });
    // Gum bulges out of the faces in soft lumps, with glossy highlights.
    for (let y = GUM_TOP; y < FLOOR; y++)
      for (const [fx, dir] of [[GUM_X - 1, -1], [GUM_X + GUM_W, 1]] as const) {
        const out = Math.round(Math.max(0, fbm(y * 0.08, fx * 0.1, seed + 12, 2) - 0.45) * 9);
        for (let k = 0; k < out; k++) { solid(fx + dir * k, y, MAT.gum, M.gum, k === out - 1 ? 0.98 : 0.8); buf.glow(fx + dir * k, y, VIOLET, 0.14); }
        // Glossy sheen on the bulges: a bright lilac pixel that glows a little.
        if (out > 0 && hash2(fx, y, seed) < 0.3) { buf.blend(fx + dir * (out - 1), y, hex("#e4ccff"), 0.7); buf.glow(fx + dir * (out - 1), y, hex("#e4ccff"), 0.25); }
      }
    // Gum strands sagging off the ledge corners.
    const strands: [number, number, number][] = [[GUM_X - 5, GUM_TOP, 9], [GUM_X + GUM_W + 4, GUM_TOP, 14], [GUM_X + 12, GUM_TOP, 4]];
    rect(GUM_X - 6, GUM_TOP - 6, GUM_W + 12, 6, (x, y) => solid(x, y, null, M.rock));
    // Resin route on the right: a fallen column leaning on the wall, running with amber resin, lit by the sun.
    for (let x = 236; x < W; x++) {
      const top = Math.round(FLOOR - (x - 236) * 2.07 + Math.sin(x * 0.4) * 1.5);
      const thick = Math.round(26 + Math.max(0, (x - 290)) * 2);
      for (let y = Math.max(GUM_TOP + 4, top); y < Math.min(FLOOR, top + thick); y++) {
        const d = y - top;
        if (d < 7) {
          solid(x, y, MAT.resin, M.resin, d === 0 ? 0.95 : 0.85 - d * 0.07, 0.6);
          buf.glow(x, y, AMBER, (d < 2 ? 0.28 : 0.12) * (0.8 + fbm(x * 0.2, y * 0.1, seed + 4, 2) * 0.4));
        } else solid(x, y, null, M.rock);
      }
    }
    rect(292, GUM_TOP - 2, 28, 6, (x, y) => solid(x, y, null, M.rock));

    // Moss on every open top surface (sim moss there too).
    for (const p of tops(buf)) {
      if (buf.kindAt(p.x, p.y - 1) === Kind.Solid || sim[p.y * W + p.x] === M.gum || sim[p.y * W + p.x] === M.resin) continue;
      const th = hash2(p.x, p.y, seed) < 0.6 ? 2 : 1;
      for (let k = 0; k < th; k++) { paint(buf, p.x, p.y + k, MAT.moss, 0.8 - k * 0.3, seed); sim[(p.y + k) * W + p.x] = M.moss; }
    }
    // Roots crawling over the left blocks and down the pillar's back.
    const root = (x0: number, y0: number, len: number, s: number) => {
      let x = x0, y = y0;
      for (let k = 0; k < len; k++) {
        y += 1; x += Math.round((fbm(k * 0.08, s, seed + 5) - 0.5) * 3);
        if (buf.kindAt(x, y) !== Kind.Back) continue;
        buf.set(x, y, mix(hex("#3a2a1a"), hex("#5a4228"), hash2(k, s, seed)), Kind.Object, 0.3);
        if (k < len * 0.6) buf.set(x + 1, y, hex("#2e2014"), Kind.Object, 0.3);
      }
    };
    root(60, 14, 70, 1); root(118, 12, 90, 2); root(210, 16, 120, 3); root(30, 20, 60, 4);

    // Hanging leaves in the canopy hole, and a fringe along the roof edge.
    const leaves: [number, number, RGB][] = [];
    for (let x = 0; x < W; x++)
      for (let y = 0; y < 40; y++) {
        if (buf.kindAt(x, y) === Kind.Solid) continue;
        const near = buf.kindAt(x, y - 2) === Kind.Solid || buf.kindAt(x, y - 4) === Kind.Solid || y < 4;
        if (near && fbm(x * 0.15, y * 0.2, seed + 7, 2) > 0.48 - (inHole(x - 6) || inHole(x + 6) ? 0.1 : 0))
          leaves.push([x, y, mix(hex("#1f4a1c"), hex("#4a8c2c"), hash2(x, y, seed + 1))]);
      }

    const surf = tops(buf).filter((p) => buf.kindAt(p.x, p.y - 1) === Kind.Back);
    const ferns = grass(surf, seed + 3, { density: 0.5, height: 4, ramp: ["#1f4a1c", "#2f6a24", "#4a8c2c", "#6aac3a"].map(hex) });
    const vines: Vine[] = bottoms(buf)
      .filter((p) => p.y < 70 && hash2(p.x, p.y, seed) < 0.1 && (p.x < GUM_X - 8 || p.x > GUM_X + GUM_W + 8))
      .map((p, i) => ({ x: p.x, y: p.y, len: 12 + Math.floor(hash2(p.x, 1, seed) * 40), seed: i }));
    const VINE = ["#1d4f2a", "#26683a", "#2f8248"].map(hex);

    // Bob: climbing the gum's left face, pushing in and up. The lost bit waits on the ledge.
    const mat = (x: number, y: number) => sim[y * W + x] || M.air;
    const series = poseFrames(buf, {
      x: GUM_X - 14, y: FLOOR - 12, region: [100, 20, 110, 150], mat,
      bits: [{ x: GUM_X + 20, y: GUM_TOP - 12, r: 3.6 }],
      input: (f) => ({ move: f > 10 ? 1 : 0, jump: false, up: f > 30 ? 1 : 0 }),
    }, [125]);
    const bob = series[0];

    // Crumbs he sheds as he climbs: a few specks of him falling from his base, on a loop.
    const base = bob.pieces[0], bobBottom = base.cy + base.radius * 0.9;
    const crumbs = (t: number): BobView => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 3; i++) {
        const age = (t * 0.45 + i / 3) % 1;
        const x = base.cx + 3 + (hash2(i, Math.floor(t * 0.45 + i / 3), seed) - 0.5) * 6;
        const y = bobBottom + 2 + age * age * (FLOOR - bobBottom - 2);
        const n = i === 0 ? 4 : 3;
        for (let k = 0; k < n; k++) pts.push([x + (k % 2) * 0.8, y + k * 0.7]);
      }
      const n = pts.length, xs = new Float32Array(n), ys = new Float32Array(n), z = new Float32Array(n), t20 = new Float32Array(n).fill(20);
      pts.forEach(([x, y], i) => { xs[i] = x; ys[i] = y; });
      const pieces: Piece[] = [];
      for (let i = 0, s0 = 0; i < 3; i++) {
        const len = i === 0 ? 4 : 3;
        pieces.push({ start: s0, len, cx: xs[s0], cy: ys[s0], vx: 0, vy: 0, temp: 20, radius: 1, ground: 0, nx: 0, ny: -1, wet: 0 });
        s0 += len;
      }
      return { x: xs, y: ys, vx: z, vy: z, t: t20, order: Int32Array.from({ length: n }, (_, i) => i), pieces, fixedTemp: 20, facing: 1 };
    };
    // Pushing into the wall he'd look into it; draw him glancing out, so his face shows.
    const lookingOut: BobView = { ...bob, facing: -1, pieces: bob.pieces.map((p) => ({ ...p, vx: 0 })) };
    // The lost bit glints now and then, so you spot it.
    const bit = bob.pieces[1];
    const sparkle = (b: Buf, t: number) => {
      if (!bit) return;
      const k = Math.max(0, Math.sin(t * 2.2 - 3.93)) ** 6;
      const gx = Math.round(bit.cx - 1), gy = Math.round(bit.cy - 3);
      for (const [dx, dy, w] of [[0, 0, 1], [1, 0, 0.5], [-1, 0, 0.5], [0, -1, 0.5], [0, 1, 0.3]] as const) b.glow(gx + dx, gy + dy, [1, 0.95, 0.9], k * w * 1.2);
    };
    // Resin drips under the amber face, gum strands sagging off the pillar's ledge.
    const drips: [number, number, number][] = [];
    for (let x = 242; x < 300; x += 7 + Math.floor(hash2(x, 3, seed) * 6)) {
      let y = 0; while (y < H && !(sim[y * W + x] === M.resin)) y++;
      if (y < FLOOR - 4) drips.push([x, y, 2 + Math.floor(hash2(x, 4, seed) * 5)]);
    }

    const lights: PointLight[] = [
      // A warm pool on the ledge so the lost bit reads from across the room.
      ...(bit ? [{ x: bit.cx - 2, y: bit.cy - 9, color: hex("#ffe0c0"), radius: 34, intensity: 0.9 }] : []),
      // The sun shaft: a strong warm light high in the hole, and its pool on the resin.
      { x: 82, y: 4, color: SUN, radius: 170, intensity: 0.9 },
      { x: 212, y: 4, color: SUN, radius: 130, intensity: 0.8 },
      { x: 262, y: 100, color: AMBER, radius: 90, intensity: 1.1, flicker: 0.05 },
      // Green canopy light leaking in along the roof, and down onto the pillar.
      { x: 60, y: 34, color: CANOPY, radius: 160, intensity: 0.7 },
      { x: 104, y: 70, color: CANOPY, radius: 110, intensity: 0.6 },
      // Bounce off the gum: a faint violet fill on the pillar's face.
      { x: GUM_X - 22, y: 96, color: hex("#c8a0ff"), radius: 80, intensity: 0.55 },
      { x: GUM_X + GUM_W + 16, y: 110, color: hex("#c8a0ff"), radius: 60, intensity: 0.4 },
    ];

    return {
      buf,
      lights,
      dirs: [{ angles: [-30, -36, -42], color: [1.1, 0.85, 0.5] }],
      ambient: [0.08, 0.11, 0.08],
      depth: { fade: 16, min: 0.1 },
      backLit: 0.55,
      grade: { tint: [1.02, 1.04, 0.94], lift: [0.005, 0.01, 0.005], vignette: 0.5, bloom: 1, threshold: 0.75, exposure: 1.12 },
      frame(b, t) {
        // The shaft itself: a soft wedge of warm haze, brightest at the top.
        for (const [a, c] of HOLES) for (let y = 0; y < FLOOR; y++) {
          const cx = (a + c) / 2 + y * 0.68, half = (c - a) / 2 - 3 + y * 0.1;
          for (let x = Math.floor(cx - half); x <= cx + half; x++) {
            if (!b.inside(x, y) || b.kindAt(x, y) === Kind.Solid) continue;
            const e = 1 - Math.abs(x - cx) / half;
            const n = 0.75 + fbm(x * 0.05 + t * 0.1, y * 0.02, seed + 2, 2) * 0.5;
            b.glow(x, y, SUN, e * e * 0.07 * n * (1 - y / 230));
          }
        }
        for (const [x, y, len] of strands) {
          const l = Math.round(len * (0.8 + Math.sin(t * 0.7 + x) * 0.2));
          for (let k = 0; k < l; k++) {
            const sx = x + Math.round(Math.sin(t * 0.9 + k * 0.3 + x) * (k / len) * 1.2);
            if (b.solidAt(sx, y + k)) continue;
            b.set(sx, y + k, MAT.gum.ramp[k === l - 1 ? 3 : 2], Kind.Object, 0.2);
            if (k === l - 1) b.set(sx + 1, y + k, MAT.gum.ramp[2], Kind.Object, 0.2);
          }
        }
        for (const [x, y, len] of drips) {
          const grow = (t * 0.3 + hash2(x, 9, seed)) % 1;
          const l = Math.round(len * (0.5 + grow * 0.5));
          for (let k = 1; k <= l; k++) {
            if (b.solidAt(x - 1, y + k)) continue;
            b.set(x - 1, y + k, MAT.resin.ramp[k === l ? 3 : 2], Kind.Object, 0.2);
            b.glow(x - 1, y + k, AMBER, 0.25);
          }
        }
        for (const [x, y, c] of leaves) {
          const sway = Math.round(Math.sin(t * 1.4 + x * 0.1) * (y / 40));
          if (!b.solidAt(x + sway, y)) b.set(x + sway, y, c, Kind.Object, 0.35);
        }
        drawGrass(b, ferns, t, 0.3);
        for (const v of vines) drawVine(b, v, t, VINE, 0.4);
        drawGoo(b, lookingOut, { palette, t, selfLit: 1.6 });
        drawGoo(b, crumbs(t), { palette, t, selfLit: 1.6 });
        sparkle(b, t);
        motes(b, 18, t, seed, [200, 20, 90, 120], hex("#ffe6a8"), 0.35, 2);
        motes(b, 20, t, seed + 6, [80, 20, 90, 130], hex("#ffe6a8"), 0.35, 2);
        motes(b, 10, t, seed + 4, [10, 30, 130, 120], hex("#b8ff90"), 0.25, 3);
      },
    };
  },
};
