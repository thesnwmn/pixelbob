import { Kind } from "../kit/buf.ts";
import { Buf } from "../kit/buf.ts";
import { drawBob, movingBob } from "../kit/bob.ts";
import { gradient, hex, mix } from "../kit/color.ts";
import { blownLeaves, drawGrass, drawTree, grass, tree } from "../kit/flora.ts";
import { motes, shimmer } from "../kit/fx.ts";
import { MAT, paint } from "../kit/materials.ts";
import { each, rim, tops } from "../kit/paint.ts";
import { fbm, fbm1 } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270;
const SKY = ["#2f5fb8", "#5d8fd8", "#9cc0e8", "#f2d6b0", "#f7c08a"].map(hex);
const LEAVES = ["#173d24", "#21522a", "#2f6c30", "#448a35", "#68a83e"].map(hex);
const BARK = ["#2e1d14", "#4a2f1e", "#6a4429"].map(hex);
const GRASS = ["#2f6e2a", "#3f8a30", "#57a838", "#7cc94a", "#a6e062"].map(hex);
const FLOWERS = ["#ff5a6a", "#ffd34a", "#c08aff", "#ffffff", "#ff9a3a"].map(hex);

const ground = (x: number) =>
  218 - 48 * Math.exp(-(((x - 105) / 75) ** 2)) + 20 * Math.exp(-(((x - 300) / 38) ** 2)) - 34 * Math.exp(-(((x - 452) / 45) ** 2)) +
  (fbm1(x * 0.02, 9) - 0.5) * 14 + (fbm1(x * 0.11, 4) - 0.5) * 3;
const shelf = (x: number) => ground(x) - 20 * Math.exp(-(((x - 300) / 38) ** 2)); // the ground without the pond
const POND_Y = 214;

export const meadow: SceneDef = {
  id: "meadow",
  title: "Meadow at golden hour",
  blurb: "Grassy hills, a floating ledge, a pond. Wind tears through the canopy.",
  notes: [
    "Outdoors the backdrop is painted, unlit parallax (sky, far hills). Only the play layer is lit and simulated.",
    "Grass, leaves and flowers are individual pixels on springs: the wind field moves them, nothing is a sprite.",
    "Sunlight is a directional light with soft shadows; note the shade under the floating ledge.",
    "Bob is the most saturated thing on screen so he reads at a glance.",
  ],
  w: W,
  h: H,
  focus: [0.47, 0.62],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    // Backdrop: sky, clouds, two parallax hill layers, all unlit.
    each(buf, (x, y) => {
      let c = gradient(SKY, y / 200);
      const cl = fbm(x * 0.011 + 3, y * 0.035, seed + 11, 5) - (Math.abs(y - 70) / 70) * 0.35;
      if (cl > 0.5) {
        const under = fbm(x * 0.011 + 3, (y - 4) * 0.035, seed + 11, 5) < cl ? 0 : 1;
        c = mix(c, under ? hex("#e6c4cf") : hex("#fff4ea"), Math.min(1, (cl - 0.5) * 6) * 0.9);
      }
      const sd = Math.hypot(x - 405, y - 62);
      if (sd < 9) c = hex("#fff6dc");
      else if (sd < 40) c = mix(c, hex("#ffe9c0"), (1 - sd / 40) ** 2 * 0.7);
      const far = 168 + (fbm1(x * 0.007, seed + 2) - 0.5) * 60 - (fbm(x * 0.15, 3, seed + 1, 2) > 0.6 ? 3 : 0);
      if (y > far) c = mix(hex("#8aa6c8"), hex("#c9b7b8"), (y - far) / 80);
      const mid = 192 + (fbm1(x * 0.012, seed + 3) - 0.5) * 50;
      const bumps = fbm(x * 0.12, 1, seed + 4, 2) > 0.55 ? -3 : 0;
      if (y > mid + bumps) c = mix(hex("#5f8c84"), hex("#4b6f6c"), Math.min(1, (y - mid) / 50));
      buf.set(x, y, c, Kind.Sky, 0);
      if (sd < 9) buf.glow(x, y, hex("#fff2c8"), 1.6);
    });

    // Play layer: grass over dirt over rock, with buried stones.
    each(buf, (x, y) => {
      const g = ground(x);
      if (y >= g) {
        const d = y - g;
        const soil = 12 + fbm1(x * 0.05, seed + 5) * 14;
        if (d < 3) paint(buf, x, y, MAT.grass, 0.85 - d * 0.25, seed);
        else if (d < soil) paint(buf, x, y, fbm(x * 0.15, y * 0.15, seed + 6) > 0.68 ? MAT.rock : MAT.dirt, 0.7 - d / soil * 0.4, seed);
        else paint(buf, x, y, fbm(x * 0.08, y * 0.08, seed + 7) > 0.6 ? MAT.dirt : MAT.rock, 0.45, seed);
      } else if (y >= shelf(x) + 2) {
        paint(buf, x, y, MAT.dirt, 0.2, seed); // earth behind the pond
        buf.kind[buf.idx(x, y)] = Kind.Back;
        buf.occ[buf.idx(x, y)] = 0;
      }
      // Floating ledge.
      const lx = (x - 368) / 46;
      const top = 138 + (fbm1(x * 0.1, seed + 8) - 0.5) * 3;
      const bottom = top + 4 + (1 - lx * lx) * 26 * (0.6 + fbm1(x * 0.15, seed + 9) * 0.6);
      if (Math.abs(lx) < 1 && y >= top && y < bottom) {
        const d = y - top;
        paint(buf, x, y, d < 2 ? MAT.grass : d < 8 ? MAT.dirt : MAT.rock, d < 2 ? 0.85 : 0.5, seed);
      }
    });
    // Pond.
    for (let x = 250; x < 352; x++)
      for (let y = POND_Y; ground(x) > POND_Y && y < H && !buf.solidAt(x, y); y++) {
        const depth = (y - POND_Y) / 20;
        buf.blend(x, y, gradient([hex("#3f86c0"), hex("#1d4c86"), hex("#12305c")], depth), y === POND_Y ? 0.9 : 0.8, Kind.Fluid, 0.12);
        if (y === POND_Y) buf.blend(x, y, hex("#bfe8ff"), 0.6);
      }
    rim(buf, hex("#8a6a48"), 0.18, 1);

    const surf = tops(buf).filter((p) => buf.kindAt(p.x, p.y - 1) !== Kind.Fluid && buf.kindAt(p.x, p.y - 1) !== Kind.Back);
    const blades = grass(surf, seed, { density: 0.85, height: 5, ramp: GRASS, flowers: FLOWERS, flowerRate: 0.05 });
    const trees = [tree(92, ground(92) + 1, 62, seed + 1, LEAVES, BARK), tree(150, ground(150) + 1, 44, seed + 2, LEAVES, BARK), tree(385, 139, 30, seed + 3, LEAVES, BARK), tree(462, ground(462) + 1, 38, seed + 4, LEAVES, BARK)];
    const bobX = 222;

    return {
      buf,
      lights: [],
      ambient: [0.22, 0.25, 0.36],
      dirs: [
        { angles: [-45, -20, 0, 20, 45], color: [0.36, 0.42, 0.55] },
        { angles: [54, 57, 60], color: [0.82, 0.66, 0.46] },
      ],
      depth: { fade: 26, min: 0.16 },
      backLit: 0.5,
      grade: { tint: [1.04, 1, 0.94], vignette: 0.3, bloom: 0.55, threshold: 0.9 },
      frame(b, t) {
        drawGrass(b, blades, t, 1);
        for (const tr of trees) drawTree(b, tr, t, 1);
        blownLeaves(b, 14, t, seed, [40, 120, 200, 80], [LEAVES[3], LEAVES[4], hex("#c8d850")], 1);
        drawBob(b, movingBob(bobX, (x) => Math.round(ground(x)), 12, 1, t), { palette, t, eyes: { x: bobX + 5, y: Math.round(ground(bobX)) - 15, look: 1, size: 2 } });
        shimmer(b, 262, 342, POND_Y, t, seed, hex("#ffffff"), 0.7);
        motes(b, 10, t, seed + 5, [180, 150, 200, 60], hex("#ffe9a0"), 0.6, 3);
      },
    };
  },
};
