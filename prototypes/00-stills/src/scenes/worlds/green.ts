import { M } from "@pixelbob/sim";
import { Buf, Kind } from "../../kit/buf.ts";
import { gradient, hex, mix } from "../../kit/color.ts";
import { blownLeaves, drawGrass, drawTree, grass, tree } from "../../kit/flora.ts";
import { motes, shimmer } from "../../kit/fx.ts";
import { drawGoo, poseFrames } from "../../kit/goo.ts";
import { MAT, paint } from "../../kit/materials.ts";
import { each, rim, tops } from "../../kit/paint.ts";
import { fbm, fbm1, hash2 } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
const SKY = ["#27305e", "#4a4f8a", "#9a7a9e", "#e8a08a", "#ffc47a"].map(hex);
const LEAVES = ["#14301f", "#1d4426", "#2b5e2c", "#447f33", "#6fa23e"].map(hex);
const BARK = ["#23160f", "#3a2517", "#573823"].map(hex);
const GRASS = ["#2f6e2a", "#3f8a30", "#57a838", "#7cc94a", "#b0e070"].map(hex);
const FLOWERS = ["#ffd34a", "#ffffff", "#c08aff", "#ff9a3a"].map(hex);
const SUN = { x: 52, y: 58 };

const RAMP0 = 186, RAMP1 = 236, VALLEY = 150, LEDGE = 80, POND_Y = 138;
/** The hill: a crest on the left, a valley, a steep moss ramp, and a ledge that overhangs a pond. */
const ground = (x: number): number => {
  let g: number;
  if (x < 84) g = 98;
  else if (x < 160) g = 98 + (VALLEY - 98) * (0.5 - 0.5 * Math.cos(((x - 84) / 76) * Math.PI));
  else if (x < RAMP0) g = VALLEY;
  else if (x < RAMP1) { const f = (x - RAMP0) / (RAMP1 - RAMP0); g = VALLEY + (LEDGE - VALLEY) * (f * 0.92 + Math.sin(f * Math.PI) * 0.06 + (f > 0.9 ? (f - 0.9) * 0.8 : 0)); }
  else g = LEDGE;
  return Math.round(g + (fbm1(x * 0.06, 9) - 0.5) * (x >= RAMP0 && x < RAMP1 ? 1.5 : 4));
};
/** Right edge of the ledge at height y: it overhangs the pond. */
const cliff = (y: number) => 300 - Math.max(0, y - 92) * 0.42 + (fbm1(y * 0.15, 4) - 0.5) * 4;
const onRamp = (x: number) => x >= RAMP0 - 2 && x < RAMP1 + 6;

export const green: SceneDef = {
  id: "green",
  title: "The Green",
  blurb: "World 1. Build speed off the hill, and let the moss carry you up to the bit on the ledge.",
  notes: [
    "The puzzle: a lost bit of Bob waits on a ledge above a pond. The ramp to it is too steep to roll up on rock, but it's moss: green grips.",
    "Fun comes from momentum: roll off the crest, keep the speed through the dip, and the moss does the rest. Stop short and you slide back.",
    "Bob is the real goo, posed by playing him off the hill: he leans into the roll.",
    "Golden hour: the sun sits low behind the crest, so everything facing it rims gold and the ledge throws a long shadow over the pond.",
    "Moss reads by texture as well as colour: dark, lumpy and flat against bright, bladed grass.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    const sim = new Uint8Array(W * H);
    // Backdrop: low sun, pink clouds, two hazy hill layers. Unlit.
    each(buf, (x, y) => {
      let c = gradient(SKY, Math.min(1, y / 125 + Math.max(0, 1 - Math.hypot(x - SUN.x, y - SUN.y) / 160) * 0.25));
      const cl = fbm(x * 0.016 + 3, y * 0.05, seed + 11, 5) - (Math.abs(y - 42) / 40) * 0.4;
      if (cl > 0.5) {
        const lit = fbm(x * 0.016 + 3 + 0.05, (y + 3) * 0.05, seed + 11, 5) < cl ? 1 : 0;
        c = mix(c, lit ? hex("#ffd6a8") : hex("#a67890"), Math.min(1, (cl - 0.5) * 5) * 0.85);
      }
      const sd = Math.hypot(x - SUN.x, y - SUN.y);
      if (sd < 6) c = hex("#fff4d6");
      else if (sd < 34) c = mix(c, hex("#ffe0a0"), (1 - sd / 34) ** 2 * 0.8);
      const far = 112 + (fbm1(x * 0.01, seed + 2) - 0.5) * 34;
      if (y > far) c = mix(hex("#8a7aa8"), hex("#b48a98"), Math.min(1, (y - far) / 50));
      const mid = 128 + (fbm1(x * 0.016 + 5, seed + 3) - 0.5) * 30 - (fbm(x * 0.2, 1, seed + 4, 2) > 0.62 ? 3 : 0);
      if (y > mid) c = mix(hex("#4f5a7a"), hex("#3e4766"), Math.min(1, (y - mid) / 40));
      buf.set(x, y, c, Kind.Sky, 0);
      if (sd < 6) buf.glow(x, y, hex("#fff0c0"), 1.8);
    });

    // Play layer: grass over dirt over rock; moss on the ramp; the ledge and its overhang.
    each(buf, (x, y) => {
      const g = ground(x);
      if (y < g || x > cliff(y)) return;
      const d = y - g;
      const soil = 9 + fbm1(x * 0.05, seed + 5) * 10;
      if (onRamp(x) && d < 6 + (x > RAMP1 ? -(x - RAMP1) : 0)) {
        // Moss: a thick, lumpy cushion, brighter on its bumps.
        const bump = fbm(x * 0.3, y * 0.3, seed + 12, 2);
        paint(buf, x, y, MAT.moss, d === 0 ? 0.7 + bump * 0.4 : 0.55 + bump * 0.4 - d * 0.07, seed);
        if (d === 0 || (d === 1 && bump > 0.55)) buf.blend(x, y, hex("#a8cc58"), 0.45);
        sim[y * W + x] = M.moss;
      } else if (d < 2) paint(buf, x, y, MAT.grass, 0.85 - d * 0.3, seed);
      else if (d < soil && !(x > 246 && y > 96)) paint(buf, x, y, fbm(x * 0.15, y * 0.15, seed + 6) > 0.7 ? MAT.rock : MAT.dirt, 0.7 - (d / soil) * 0.4, seed);
      else paint(buf, x, y, fbm(x * 0.08, y * 0.08, seed + 7) > 0.62 ? MAT.dirt : MAT.rock, 0.5, seed);
      if (!sim[y * W + x]) sim[y * W + x] = M.rock;
    });
    // Cushions of moss standing proud of the ramp: rounded lumps, lime on top, dark beneath.
    for (let x = RAMP0 - 2; x < RAMP1 + 4; x++) {
      const g = ground(x), n = fbm1(x * 0.22, seed + 13, 2), lump = Math.round(1 + Math.max(0, n - 0.35) * 8 + Math.sin(x * 0.7) * 0.6);
      for (let k = 1; k <= lump; k++) {
        paint(buf, x, g - k, MAT.moss, 0.55 + (k / lump) * 0.4, seed);
        if (k === lump) buf.blend(x, g - k, hex("#c4e66a"), 0.55);
        else if (k === lump - 1) buf.blend(x, g - k, hex("#9cc850"), 0.35);
        sim[(g - k) * W + x] = M.moss;
      }
    }
    // Moss creeping over the lip of the ledge, a few clumps on the ledge.
    for (let x = RAMP1; x < 300; x++) {
      const g = ground(x);
      if (hash2(x, 3, seed) < (x < RAMP1 + 14 ? 0.9 : 0.12)) { paint(buf, x, g, MAT.moss, 0.8, seed); sim[g * W + x] = M.moss; }
    }
    // Pond under the overhang.
    for (let x = 250; x < W; x++)
      for (let y = POND_Y; y < H; y++) {
        if (buf.solidAt(x, y) || x <= cliff(y)) continue;
        if (y > 170 + (fbm1(x * 0.1, 6) - 0.5) * 4) { paint(buf, x, y, MAT.dirt, 0.3, seed); continue; }
        const depth = (y - POND_Y) / 18;
        buf.set(x, y, gradient([hex("#5a8ac0"), hex("#24508a"), hex("#122c58")], depth), Kind.Fluid, 0.12);
        if (y === POND_Y) buf.blend(x, y, hex("#ffd8a8"), 0.6);
      }
    rim(buf, hex("#c89060"), 0.16, 1);

    const surf = tops(buf).filter((p) => buf.kindAt(p.x, p.y - 1) === Kind.Sky && !onRamp(p.x) && sim[p.y * W + p.x] !== M.moss);
    const blades = grass(surf, seed, { density: 0.8, height: 4, ramp: GRASS, flowers: FLOWERS, flowerRate: 0.05 });
    const trees = [tree(26, ground(26) + 1, 60, seed + 1, LEAVES, BARK), tree(70, ground(70) + 1, 30, seed + 5, LEAVES, BARK), tree(292, ground(292) + 1, 34, seed + 3, LEAVES, BARK)];

    // Bob: the real goo, rolled off the crest; caught leaning into the downhill. The lost bit waits on the ledge.
    const BIT = { x: 268, y: LEDGE - 5 };
    const [bob] = poseFrames(buf, {
      x: 46, y: 86, mat: (x, y) => sim[y * W + x] || M.air,
      bits: [{ x: BIT.x, y: BIT.y, r: 4.4 }],
      input: () => ({ move: 1, jump: false }),
    }, [92]);

    return {
      buf,
      lights: [
        { x: SUN.x, y: SUN.y, color: hex("#ffcf90"), radius: 140, intensity: 0.35 },
        { x: BIT.x, y: BIT.y - 2, color: hex("#ffd0d8"), radius: 22, intensity: 0.5 },
      ],
      ambient: [0.2, 0.19, 0.3],
      dirs: [
        { angles: [-40, -15, 10, 35], color: [0.3, 0.32, 0.52] },
        { angles: [-58, -62, -66], color: [1.05, 0.74, 0.44] },
      ],
      depth: { fade: 28, min: 0.16 },
      backLit: 0.45,
      grade: { tint: [1.06, 0.99, 0.92], lift: [0.012, 0.006, 0.02], vignette: 0.4, bloom: 0.7, threshold: 0.85 },
      frame(b, t) {
        drawGrass(b, blades, t, 0.8);
        for (const tr of trees) drawTree(b, tr, t, 0.8);
        drawGoo(b, bob, { palette, t });
        // The lost bit glints.
        const tw = 0.5 + 0.5 * Math.sin(t * 2.6);
        for (const [dx, dy, k] of [[0, -6, 1], [0, -7, 0.6], [-1, -6, 0.5], [1, -6, 0.5], [0, -5, 0.5]] as const) {
          b.blend(BIT.x + dx, BIT.y + dy, hex("#fff6e8"), k * tw);
          b.glow(BIT.x + dx, BIT.y + dy, hex("#ffe8d0"), k * tw * 0.8);
        }
        shimmer(b, 272, W - 1, POND_Y, t, seed, hex("#ffe8c0"), 0.6);
        blownLeaves(b, 8, t, seed, [0, 50, 140, 60], [LEAVES[3], LEAVES[4], hex("#d8c050")], 0.8);
        motes(b, 18, t, seed + 5, [60, 70, 220, 70], hex("#ffe6a0"), 0.5, 3);
      },
    };
  },
};
