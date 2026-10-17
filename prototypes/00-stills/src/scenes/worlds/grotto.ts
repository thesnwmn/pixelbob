import { M } from "@pixelbob/sim";
import { Buf, Kind } from "../../kit/buf.ts";
import { hex, mix } from "../../kit/color.ts";
import { flame, plume } from "../../kit/fx.ts";
import { drawGoo, poseBob } from "../../kit/goo.ts";
import type { PointLight } from "../../kit/light.ts";
import { MAT, paint } from "../../kit/materials.ts";
import { bottoms, disc, each, rim, stroke, tops } from "../../kit/paint.ts";
import { fbm, fbm1, hash1, hash2, rng } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
/** The lake's surface, and where its banks end. */
const LAKE_Y = 132, LAKE_X0 = 64, LAKE_X1 = 252;
const FIRE_X = 284, FALL_X = 34, BOB_X = 172;
const WARM = hex("#ffa040"), MOON = hex("#9fc8ff");
const SMOKE = ["#2a2a30", "#3a3a42", "#4a4a52"].map(hex);
const WATER = ["#081426", "#0c1c34", "#112540"].map(hex);

/** Cave rock: > 0 is solid. A wide chamber, a moon hole in the roof, two banks and a lake bed. */
function density(x: number, y: number, seed: number): number {
  const cx = (x - 160) / 180, cy = (y - 88) / 70;
  let d = cx * cx * 0.45 + cy * cy - 0.62 + (fbm(x * 0.018, y * 0.03, seed, 5) - 0.5) * 0.7;
  d -= Math.exp(-(((x - 150) / 20) ** 2)) * Math.max(0, 1 - y / 46) * 1.8; // the moon hole
  // Banks: left and right shelves at about the lake's height; a deep bed between.
  const bank = (bx: number, s: number) => 1 / (1 + Math.exp(s * (x - bx)));
  const shelf = LAKE_Y + 2 + (fbm1(x * 0.05, seed + 2) - 0.5) * 6;
  const bed = 168 - Math.sin(((x - LAKE_X0) / (LAKE_X1 - LAKE_X0)) * Math.PI) * 6;
  const floor = shelf * (bank(LAKE_X0, 0.35) + 1 - bank(LAKE_X1, 0.35)) + bed * (bank(LAKE_X1, 0.35) - bank(LAKE_X0, 0.35));
  if (y > LAKE_Y - 6) d = (y - floor) / 6 + (fbm(x * 0.1, y * 0.1, seed + 3) - 0.5) * 0.6;
  else d = Math.max(d, (y - floor) / 6);
  return d;
}

export const grotto: SceneDef = {
  id: "grotto",
  title: "Frozen Grotto",
  blurb: "Frozen solid, Bob slides out over black water and freezes his own bridge. The fire on the far bank will let him move again.",
  notes: [
    "The puzzle: the far bank is out of reach. Frozen, Bob can't roll or jump, but he freezes the water he touches: get cold enough, slide out, and the lake becomes a road.",
    "The trade-off: frozen he can't jump, and he cracks if he falls. The campfire across the lake thaws him back into a Bob who can.",
    "Two lights fight over the frame: cold moonlight from the hole in the roof, warm firelight from the far bank. Bob sits on the line between them.",
    "Frozen Bob is faceted and clear, with squinting eyes: he reads as Bob made of ice, not as ice.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    each(buf, (x, y) => {
      if (density(x, y, seed) > 0) paint(buf, x, y, MAT.stone, 0.5 + fbm(x * 0.06, y * 0.06, seed + 1) * 0.4, seed);
      else {
        const n = fbm(x * 0.04, y * 0.07, seed + 2);
        buf.set(x, y, mix(hex("#1e2a40"), hex("#3e5272"), n), Kind.Back, 0);
        if (hash2(x, y, seed + 3) < 0.004) buf.blend(x, y, hex("#9fc0e8"), 0.5); // frost glints
      }
    });
    // Night sky through the hole: unlit backdrop, with a few stars.
    each(buf, (x, y) => {
      if (buf.kind[buf.idx(x, y)] !== Kind.Back || y > 40 || Math.abs(x - 150) > 22 - y * 0.25) return;
      buf.set(x, y, mix(hex("#0a1430"), hex("#1c2c56"), y / 40), Kind.Sky, 0);
      if (hash2(x, y, seed + 9) < 0.02) buf.set(x, y, hex("#dfe8ff"), Kind.Sky, 0);
    });
    rim(buf, hex("#8aa4c8"), 0.35, 2);
    const ground = (x: number) => { for (let y = 60; y < H; y++) if (buf.solidAt(x, y)) return y; return H; };

    // The lake: dark water, translucent over the back wall.
    for (let x = LAKE_X0 - 12; x < LAKE_X1 + 12; x++)
      for (let y = LAKE_Y; y < H && !buf.solidAt(x, y); y++) {
        const c = WATER[Math.min(2, Math.floor(hash2(x, y, seed) * 3))];
        buf.blend(x, y, mix(c, hex("#04080f"), Math.min(1, (y - LAKE_Y) / 30)), 0.88, Kind.Fluid, 0.12);
        if (y === LAKE_Y) buf.blend(x, y, hex("#5a80b8"), 0.7);
        else if (y === LAKE_Y + 1) buf.blend(x, y, hex("#2a4470"), 0.4);
        else if (fbm(x * 0.08, y * 0.6, seed + 12) > 0.66) buf.blend(x, y, hex("#1e3458"), 0.5); // ripples
      }

    // The ice Bob froze: a road from the left bank out to him, thick under him, thin and
    // cracked behind, with a frozen fringe reaching a little way down into the water.
    const icy = new Uint8Array(W * H);
    for (let x = LAKE_X0 - 6; x <= BOB_X + 16; x++) {
      if (buf.solidAt(x, LAKE_Y)) continue;
      const near = Math.max(0, 1 - Math.abs(x - BOB_X) / 18);
      const th = 2 + Math.round(near * 3 + fbm1(x * 0.3, seed + 5) * 1.5);
      for (let k = 0; k < th; k++) {
        const y = LAKE_Y - 1 + k;
        if (buf.solidAt(x, y)) continue;
        paint(buf, x, y, MAT.ice, k === 0 ? 0.95 : 0.55 - k * 0.08, seed);
        buf.glow(x, y, MOON, k === 0 ? 0.12 : 0.04);
        icy[y * W + x] = 1;
      }
      // Hairline cracks in the thin part.
      if (x < BOB_X - 20 && hash1(x, seed + 6) < 0.08) buf.set(x, LAKE_Y - 1, hex("#5a7aa6"), Kind.Solid, 0.22);
    }
    // Frost spikes growing down into the water under him.
    for (let i = 0; i < 9; i++) {
      const x = BOB_X - 14 + Math.round(hash1(i, seed + 7) * 30), len = 2 + Math.round(hash1(i, seed + 8) * 5);
      for (let k = 0; k < len; k++) if (!buf.solidAt(x, LAKE_Y + 3 + k)) { paint(buf, x, LAKE_Y + 3 + k, MAT.ice, 0.7 - k * 0.08, seed); buf.kind[buf.idx(x, LAKE_Y + 3 + k)] = Kind.Object; }
    }

    // Frozen waterfall down the left wall into the lake.
    for (let y = 0; y < LAKE_Y + 2; y++) {
      const half = 5 + Math.sin(y * 0.11) * 1.5 + fbm1(y * 0.07, seed + 4) * 3;
      for (let x = Math.round(FALL_X - half); x <= FALL_X + half; x++) {
        if (buf.solidAt(x, y) && y < 40) continue;
        const streak = fbm(x * 0.5, y * 0.04, seed + 5);
        paint(buf, x, y, MAT.ice, 0.3 + streak * 0.6, seed, 0);
        buf.kind[buf.idx(x, y)] = Kind.Object; // translucent: lit all the way through
        buf.glow(x, y, hex("#9fd8ff"), 0.1 + Math.max(0, streak - 0.55) * 0.8);
      }
    }

    // Snow on every open top surface (not the lake), melted near the fire.
    for (const p of tops(buf)) {
      if (buf.kindAt(p.x, p.y - 1) !== Kind.Back || icy[p.y * W + p.x]) continue;
      const melt = Math.abs(p.x - FIRE_X) < 16;
      const depth = melt ? 0 : 2 + Math.round(fbm1(p.x * 0.1, seed + 6) * 3);
      for (let k = 0; k < depth; k++) paint(buf, p.x, p.y - k, MAT.snow, 0.9 - k * 0.15, seed);
    }
    // Icicles from the roof.
    const r = rng(seed + 7);
    for (const p of bottoms(buf)) {
      if (p.y > 90 || hash2(p.x, p.y, seed) > 0.16) continue;
      const len = 2 + Math.floor(r() * r() * 14);
      for (let k = 1; k <= len; k++) {
        const wdt = k < len * 0.4 ? 1 : 0;
        for (let o = -wdt; o <= 0; o++) paint(buf, p.x + o, p.y + k, MAT.ice, 0.9 - (k / len) * 0.5, seed);
      }
    }
    // Campfire on the far bank: stones and crossed logs.
    const gF = ground(FIRE_X);
    for (const dx of [-8, -5, 5, 8]) disc(FIRE_X + dx, gF - 1, 1.6, (x, y) => paint(buf, x, y, MAT.rock, 0.8, seed));
    stroke(FIRE_X - 6, gF - 1, FIRE_X + 5, gF - 3, 1, (x, y) => paint(buf, x, y, MAT.wood, 0.6, seed));
    stroke(FIRE_X + 6, gF - 1, FIRE_X - 4, gF - 3, 1, (x, y) => paint(buf, x, y, MAT.wood, 0.4, seed));
    for (let x = FIRE_X - 4; x <= FIRE_X + 4; x++) buf.glow(x, gF - 2, WARM, 0.6);

    // Bob: cold and stiff, settled on the ice he made, then frozen solid in that shape.
    const bob = poseBob(buf, {
      x: BOB_X, y: LAKE_Y - 12, temp: 20, frames: 80, region: [BOB_X - 40, LAKE_Y - 50, 80, 60],
      // The ice under him is rock to the sim, so he sits still on it for the shot.
      mat: (x, y, k) => (icy[y * W + x] || k === Kind.Solid ? M.rock : M.air),
      each: (f, b) => { if (f === 40) b.fixedTemp = -16; },
    });

    const lights: PointLight[] = [
      { x: FIRE_X, y: gF - 8, color: WARM, radius: 150, intensity: 2.4, flicker: 0.9, seed: 3 },
      { x: 150, y: 6, color: MOON, radius: 200, intensity: 2 },
      { x: 150, y: 110, color: MOON, radius: 110, intensity: 0.8 },
      { x: FALL_X, y: 90, color: hex("#7fc0ff"), radius: 70, intensity: 0.5 },
      { x: 60, y: 112, color: MOON, radius: 60, intensity: 0.5 },
    ];

    return {
      buf,
      lights,
      ambient: [0.13, 0.16, 0.24],
      depth: { fade: 14, min: 0.07 },
      backLit: 0.6,
      grade: { tint: [0.96, 1, 1.06], vignette: 0.45, bloom: 0.9, threshold: 0.75 },
      frame(b, t) {
        flame(b, FIRE_X, gF - 3, 6, 22, t, seed, 1.1);
        plume(b, FIRE_X + 1, gF - 20, 80, t, seed + 1, SMOKE, 0.5, 0.6, 10);
        // Firelight and moonlight glinting on the open water.
        for (let x = LAKE_X0; x < LAKE_X1; x++) {
          if (b.solidAt(x, LAKE_Y)) continue;
          const g = Math.sin(x * 0.7 + t * 2.3 + hash1(x, seed) * 6);
          if (g > 0.93) b.glow(x, LAKE_Y, x > 200 ? WARM : MOON, 0.5);
        }
        // The moon's reflection, broken up by ripples, and the fire's on the far side.
        for (const [cx, c, k] of [[150, MOON, 0.35], [FIRE_X - 22, WARM, 0.45]] as const)
          for (let y = LAKE_Y + 2; y < LAKE_Y + 22; y++) {
            const w = 5 - (y - LAKE_Y) * 0.15, x = Math.round(cx + Math.sin(y * 1.7 + t * 3) * 2 + (hash2(y, Math.floor(t * 4), seed) - 0.5) * w * 2);
            if (!b.solidAt(x, y) && b.kindAt(x, y) === Kind.Fluid) { b.blend(x, y, c, k * (1 - (y - LAKE_Y) / 24)); b.glow(x, y, c, 0.6 * (1 - (y - LAKE_Y) / 24)); }
          }
        // Snow drifting down through the hole.
        for (let i = 0; i < 28; i++) {
          const life = 7 + hash1(i, seed) * 5, age = (t + hash1(i, seed + 1) * life) % life;
          const x = 150 + (hash1(i, seed + 2) - 0.5) * (24 + age * 16) + Math.sin(age * 1.4 + i) * 3;
          const y = age * 20;
          if (y < LAKE_Y && !b.solidAt(x, y)) b.set(x, y, hash1(i, 9) > 0.5 ? [1, 1, 1] : hex("#cfe2f5"), Kind.Object, 0);
        }
        drawGoo(b, bob, { palette, t, selfLit: 0.5, temp: -4 });
        // Cold mist curling off him.
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.5 + i * 0.2) % 1;
          b.blend(BOB_X - 6 + i * 3 + Math.sin(age * 5 + i) * 2, LAKE_Y - 18 - age * 10, hex("#e8f4ff"), 0.35 * (1 - age), Kind.Fluid);
        }
      },
    };
  },
};
