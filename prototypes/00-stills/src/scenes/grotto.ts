import { Buf, Kind } from "../kit/buf.ts";
import { drawBob, idleBob, type Lobe } from "../kit/bob.ts";
import { hex, mix } from "../kit/color.ts";
import { flame, plume } from "../kit/fx.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint } from "../kit/materials.ts";
import { bottoms, disc, each, rim, stroke, tops } from "../kit/paint.ts";
import { fbm, fbm1, hash1, hash2, rng } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270;
const FIRE_X = 104;
const WARM = hex("#ffa040"), COLD = hex("#9fc8ff");
const SMOKE = ["#2a2a30", "#3a3a42", "#4a4a52"].map(hex);

function density(x: number, y: number, seed: number): number {
  const cx = (x - 240) / 260, cy = (y - 135) / 100;
  let d = cx * cx * 0.5 + cy * cy - 0.7 + (fbm(x * 0.012, y * 0.02, seed, 5) - 0.5) * 0.9;
  d += Math.max(0, 0.25 - Math.abs(y - 228) / 40) * (fbm1(x * 0.02, seed + 1) - 0.3); // floor bumps
  d += Math.max(0, (y - 186 - (fbm1(x * 0.012, seed + 2) - 0.5) * 50) / 30) * 0.9; // raise the floor
  d -= Math.exp(-(((x - 262) / 16) ** 2)) * Math.max(0, 1 - y / 70) * 1.6; // skylight hole in the roof
  return d;
}

export const grotto: SceneDef = {
  id: "grotto",
  title: "Frozen grotto",
  blurb: "Snow, icicles and a frozen waterfall. A campfire is the only warmth; Bob has wandered too far from it.",
  notes: [
    "Cold makes Bob stiff and brittle: faceted shading, cracks, a piece already chipped off.",
    "Fire is pixels: a heat field scrolling up through noise, sparks and smoke as their own particles.",
    "Fire melts snow around it (bare rock ring), and its flicker drives the main light.",
    "Ice is translucent to light: the frozen waterfall glows from the skylight behind it.",
  ],
  w: W,
  h: H,
  focus: [0.5, 0.65],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    each(buf, (x, y) => {
      if (density(x, y, seed) > 0) paint(buf, x, y, MAT.stone, 0.5 + fbm(x * 0.05, y * 0.05, seed + 1) * 0.4, seed);
      else {
        const n = fbm(x * 0.03, y * 0.06, seed + 2);
        buf.set(x, y, mix(hex("#2a364c"), hex("#4a5f80"), n), Kind.Back, 0);
        if (hash2(x, y, seed + 3) < 0.01) buf.blend(x, y, hex("#9fc0e8"), 0.5); // frost glints
      }
    });
    rim(buf, hex("#8aa4c8"), 0.35, 2);
    const ground = (x: number) => { for (let y = 140; y < H; y++) if (buf.solidAt(x, y)) return y; return H; };

    // Frozen waterfall from a crack in the wall down to an ice pool.
    for (let y = 0; y < H; y++) {
      const half = 9 + Math.sin(y * 0.08) * 2 + fbm1(y * 0.05, seed + 4) * 4;
      for (let x = Math.round(392 - half); x <= 392 + half; x++) {
        if (buf.solidAt(x, y) && y < 60) continue;
        const streak = fbm(x * 0.4, y * 0.03, seed + 5);
        paint(buf, x, y, MAT.ice, 0.3 + streak * 0.6, seed, 0);
        buf.kind[buf.idx(x, y)] = Kind.Object; // lit like a surface all the way through: it's translucent
        buf.glow(x, y, hex("#9fd8ff"), 0.06 + Math.max(0, streak - 0.6) * 0.5);
      }
    }
    // Snow on every top surface, melted near the fire.
    for (const p of tops(buf)) {
      if (buf.kindAt(p.x, p.y - 1) !== Kind.Back) continue;
      const melt = Math.abs(p.x - FIRE_X) < 30;
      const depth = melt ? 0 : 2 + Math.round(fbm1(p.x * 0.08, seed + 6) * 4);
      for (let k = 0; k < depth; k++) paint(buf, p.x, p.y - k, MAT.snow, 0.9 - k * 0.15, seed);
    }
    // Icicles.
    const r = rng(seed + 7);
    for (const p of bottoms(buf)) {
      if (p.y > 150 || hash2(p.x, p.y, seed) > 0.13) continue;
      const len = 3 + Math.floor(r() * r() * 18);
      for (let k = 1; k <= len; k++) {
        const wdt = k < len * 0.4 ? 1 : 0;
        for (let o = -wdt; o <= 0; o++) paint(buf, p.x + o, p.y + k, MAT.ice, 0.9 - k / len * 0.5, seed);
      }
    }
    // Campfire: a ring of stones and crossed logs.
    const gF = ground(FIRE_X);
    for (const dx of [-12, -8, 8, 12]) disc(FIRE_X + dx, gF - 1, 2.2, (x, y) => paint(buf, x, y, MAT.rock, 0.8, seed));
    stroke(FIRE_X - 9, gF - 1, FIRE_X + 7, gF - 4, 1.2, (x, y) => paint(buf, x, y, MAT.wood, 0.6, seed));
    stroke(FIRE_X + 9, gF - 1, FIRE_X - 6, gF - 4, 1.2, (x, y) => paint(buf, x, y, MAT.wood, 0.4, seed));
    for (let x = FIRE_X - 6; x <= FIRE_X + 6; x++) buf.glow(x, gF - 2, WARM, 0.6);

    const lights: PointLight[] = [
      { x: FIRE_X, y: gF - 10, color: WARM, radius: 220, intensity: 2.6, flicker: 0.9, seed: 3 },
      { x: 262, y: 20, color: COLD, radius: 260, intensity: 1.9 },
      { x: 262, y: 150, color: COLD, radius: 150, intensity: 1.0 },
      { x: 392, y: 120, color: hex("#7fc0ff"), radius: 100, intensity: 0.5 },
    ];
    const bobX = 290, gB = (x: number) => ground(x);

    return {
      buf,
      lights,
      ambient: [0.13, 0.16, 0.24],
      depth: { fade: 16, min: 0.06 },
      backLit: 0.6,
      grade: { tint: [0.96, 1, 1.06], vignette: 0.4, bloom: 0.9, threshold: 0.75 },
      frame(b, t) {
        flame(b, FIRE_X, gF - 3, 9, 34, t, seed, 1.1);
        plume(b, FIRE_X + 2, gF - 28, 110, t, seed + 1, SMOKE, 0.5, 0.6, 12);
        // Snow drifting down through the skylight.
        for (let i = 0; i < 70; i++) {
          const life = 9 + hash1(i, seed) * 6, age = (t + hash1(i, seed + 1) * life) % life;
          const x = 262 + (hash1(i, seed + 2) - 0.5) * (40 + age * 22) + Math.sin(age * 1.4 + i) * 4;
          const y = age * 24;
          if (y < H && !b.solidAt(x, y)) b.set(x, y, hash1(i, 9) > 0.5 ? [1, 1, 1] : hex("#cfe2f5"), Kind.Object, 0);
        }
        // Bob, frozen: stiff, faceted, cracked. A shard has already broken off.
        const lobes: Lobe[] = idleBob(bobX, gB, 12, 0, -0.05);
        drawBob(b, lobes, { palette, state: "cold", t, loose: 0.15, selfLit: 0.12, eyes: { x: bobX + 1, y: gB(bobX) - 16, look: -1, size: 2 } });
        const sx = bobX + 22;
        drawBob(b, [{ x: sx, y: gB(sx) - 2.5, r: 3.2, sx: 1.2, sy: 0.8 }, { x: sx + 3, y: gB(sx + 3) - 1.5, r: 1.8 }], { palette, state: "cold", t, loose: 0.1, selfLit: 0.12, eyes: null });
        // Breath of frost.
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.6 + i * 0.2) % 1;
          b.blend(bobX - 14 - age * 12, gB(bobX) - 12 - age * 6 + Math.sin(age * 6) * 1.5, hex("#e8f4ff"), 0.6 * (1 - age), Kind.Fluid);
        }
      },
    };
  },
};
