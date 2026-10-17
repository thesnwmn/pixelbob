import type { BobColors, BobView } from "@pixelbob/bob";
import { Buf, Kind } from "../../kit/buf.ts";
import { hex, mix, type RGB } from "../../kit/color.ts";
import { flame, motes, plume, shimmer } from "../../kit/fx.ts";
import { drawGrass, drawVine, grass, type Vine } from "../../kit/flora.ts";
import { drawGoo, poseBob } from "../../kit/goo.ts";
import type { PointLight } from "../../kit/light.ts";
import { MAT, paint, type Material } from "../../kit/materials.ts";
import { bottoms, disc, each, rect, rim, stroke, tops } from "../../kit/paint.ts";
import { fbm, fbm1, hash2 } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
const WATER_Y = 142;
const GAS = hex("#7cff5a"), FLARE = hex("#ff8a2a"), MOON = hex("#9fb8c8");

const MUD: Material = { name: "mud", ramp: ["#241a12", "#2e2216", "#3a2c1c", "#463622"].map(hex), kind: Kind.Solid, occ: 0.55 };
const SLIME: Material = { name: "slime", ramp: ["#2c3a14", "#3a4c18", "#4e6420", "#6a822a"].map(hex), kind: Kind.Solid, occ: 0.4 };
const BRICK: Material = { name: "brick", ramp: ["#3a2420", "#462c26", "#52342c", "#5e3c32"].map(hex), kind: Kind.Solid, occ: 0.6 };
const LOG: Material = { name: "log", ramp: ["#3a2818", "#4e3620", "#64462a", "#7a5634"].map(hex), kind: Kind.Solid, occ: 0.6 };
const BOG: Material = { name: "bog water", ramp: ["#2c4a34", "#365a3c", "#426a44"].map(hex), kind: Kind.Fluid, occ: 0.2, alpha: 0.8 };
const TAR: Material = { name: "tar", ramp: ["#0a080c", "#100d12", "#16121a"].map(hex), kind: Kind.Solid, occ: 0.7 };

/** Bob full of water: his colours pulled towards a pale water blue (absorbing isn't built: this is a mock). */
function watery(p: BobColors): BobColors {
  const w = (c: RGB, to: RGB, k: number): RGB => [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
  return { body: w(p.body, [170, 200, 255], 0.3), light: w(p.light, [235, 240, 255], 0.35), dark: w(p.dark, [70, 120, 180], 0.3), rim: w(p.rim, [30, 50, 100], 0.4) };
}

// See-saw: a log over a stump. Bob's end is down, the lost bit's end is up.
const PIV = { x: 170, y: 126 };
const L = { x: 96, y: 139 }, R = { x: 238, y: 108 };
const beamY = (x: number) => L.y + ((x - L.x) * (R.y - L.y)) / (R.x - L.x);

export const sump: SceneDef = {
  id: "sump",
  title: "The Sump",
  blurb: "Under the foundry, a drowned bog: swell with water to weigh down the log and lift your lost bit to the ledge.",
  notes: [
    "The puzzle: Bob alone is too light to tip the see-saw. Soak up bog water, get heavy, sit on the low end, and the lost bit rides up to the ledge.",
    "Absorbing isn't built yet: this Bob is the real goo Bob at a bigger size with watery colours, a mock of what swelling would look like.",
    "Light story: sickly green from gas pooled in the hollows, against the orange flash of methane bubbles catching fire.",
    "Danger reads by colour: green gas, black tar, oily rainbow sheen. Bob stays the palest thing in the murk.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    // Back wall: a brick culvert fading into murk, darker low down.
    each(buf, (x, y) => {
      const n = fbm(x * 0.04, y * 0.06, seed + 2, 3);
      const brick = ((y >> 2) + ((x + ((y >> 2) & 1) * 4) >> 3)) & 1;
      const mortar = (y & 3) === 0 || ((x + ((y >> 2) & 1) * 4) & 7) === 0;
      const archD = Math.hypot((x - 175) / 120, (y - 150) / 115);
      let c = mix(hex("#1a1c18"), hex("#2a2c22"), n);
      if (archD > 1 && archD < 1.14) c = mix(hex("#3a2a24"), hex("#4a362c"), brick * 0.5 + n * 0.5);
      if (archD > 1 && archD < 1.14 && mortar) c = hex("#1c1612");
      if (archD < 1) c = mix(c, hex("#0c120e"), Math.min(1, (1 - archD) * 1.6));
      buf.set(x, y, mix(c, hex("#0e1a12"), Math.max(0, (y - 100) / 120)), Kind.Back, 0);
    });

    // Ceiling: dripping mud and brick overhead with a grate letting in a little moonlight.
    each(buf, (x, y) => {
      const top = 16 + fbm1(x * 0.03, seed + 4, 3) * 18 + (x > 210 && x < 250 ? -14 : 0);
      if (y < top) paint(buf, x, y, x > 180 ? BRICK : MUD, 0.4 + fbm(x * 0.1, y * 0.1, seed) * 0.3, seed);
    });
    for (let x = 214; x < 246; x += 4) rect(x, 0, 1, 6, (px, py) => buf.set(px, py, [0, 0, 0], Kind.Sky, 0));

    // Left bank: a mud mound with a tar pool in a dip.
    each(buf, (x, y) => {
      const g = 124 + Math.max(0, (x - 58) * 0.9) + (fbm1(x * 0.05, seed + 6, 3) - 0.5) * 8 - Math.exp(-(((x - 28) / 18) ** 2)) * 4;
      if (x < 100 && y >= g) paint(buf, x, y, MUD, 0.5 + fbm(x * 0.08, y * 0.08, seed + 1) * 0.4, seed);
    });
    // Right ledge: brick with slime on top, where the lost bit wants to go.
    const LEDGE_Y = 104;
    rect(254, LEDGE_Y, 66, H - LEDGE_Y, (x, y) => paint(buf, x, y, BRICK, y === LEDGE_Y ? 0.9 : 0.45 + ((x + y) % 7 === 0 ? 0.2 : 0), seed));
    for (let x = 254; x < W; x++) { paint(buf, x, LEDGE_Y, SLIME, 0.8, seed); if (hash2(x, 3, seed) < 0.5) paint(buf, x, LEDGE_Y + 1, SLIME, 0.5, seed); }
    // Drips of slime off the ledge edge.
    for (let k = 0; k < 9; k++) paint(buf, 254, LEDGE_Y + k, SLIME, 0.6 - k * 0.05, seed);
    // Bottom: silt under the water.
    each(buf, (x, y) => { if (y > 168 + fbm1(x * 0.04, seed + 9, 2) * 6) paint(buf, x, y, MUD, 0.3, seed); });

    // The stump the log pivots on, standing in the water.
    rect(164, PIV.y + 3, 13, H - PIV.y, (x, y) => paint(buf, x, y, LOG, x === 164 || x === 176 ? 0.2 : 0.55, seed));
    // The log beam, tilted, with a knot at each end so nothing slides off.
    stroke(L.x, L.y, R.x, R.y, 2.8, (x, y) => paint(buf, x, y, LOG, y < beamY(x) - 1 ? 0.85 : 0.45, seed + 3));
    // Branch stubs at each end, so nothing slides off.
    stroke(L.x + 2, L.y - 1, L.x, L.y - 14, 1.6, (x, y) => paint(buf, x, y, LOG, 0.7, seed));
    stroke(R.x - 2, R.y - 1, R.x, R.y - 7, 1.3, (x, y) => paint(buf, x, y, LOG, 0.7, seed));
    // Tar puddle in the dip on the left bank.
    const tar: { x: number; y: number }[] = [];
    for (let x = 14; x < 44; x++) {
      let g = 0; while (g < H && !buf.solidAt(x, g + 100)) g++;
      for (let k = 0; k < 3; k++) paint(buf, x, g + 100 + k, TAR, k === 0 ? 0.95 : 0.3, seed);
      tar.push({ x, y: g + 100 });
    }

    rim(buf, hex("#4a5a3a"), 0.3, 2);

    // Reeds on the bank and roots hanging from the ceiling.
    const reeds = grass(tops(buf).filter((p) => p.x < 90 && p.y > 100 && buf.kindAt(p.x, p.y - 1) === Kind.Back), seed + 3, { density: 0.5, height: 9, ramp: ["#1e2a12", "#2a3a16", "#3a4e1c"].map(hex), flowers: [hex("#4a3420")], flowerRate: 0.15 });
    const roots: Vine[] = bottoms(buf).filter((p) => p.y < 40 && hash2(p.x, p.y, seed) < 0.08).map((p, i) => ({ x: p.x, y: p.y, len: 8 + Math.floor(hash2(p.x, 2, seed) * 26), seed: i }));
    // Bog water: murky, translucent, filling everything below the line that isn't solid. Scum near
    // the surface glows faintly green.
    for (let x = 0; x < W; x++)
      for (let y = WATER_Y; y < H; y++) if (!buf.solidAt(x, y)) {
        paint(buf, x, y, BOG, y === WATER_Y ? 0.95 : 0.4 - (y - WATER_Y) * 0.01, seed);
        const scum = fbm(x * 0.08, y * 0.2, seed + 21, 2);
        buf.glow(x, y, hex("#3a8a3a"), Math.max(0, scum - 0.45) * 0.35 * Math.max(0, 1 - (y - WATER_Y) / 20));
      }

    // Bob, swollen and heavy, settles on the low end of the log.
    const view: BobView = poseBob(buf, { x: 116, y: 118, frames: 150, tweaks: { size: 12 }, region: [70, 60, 130, 100] });
    // The lost bit, on the high end.
    const bit: BobView = poseBob(buf, { x: 228, y: 102, frames: 90, tweaks: { size: 4 }, region: [200, 80, 50, 40] });
    const wet = watery(palette);

    const lights: PointLight[] = [
      { x: 40, y: 116, color: GAS, radius: 120, intensity: 1.1, flicker: 0.1 },
      { x: 292, y: 140, color: GAS, radius: 100, intensity: 0.9, flicker: 0.1 },
      { x: 204, y: WATER_Y - 8, color: FLARE, radius: 140, intensity: 1.8, flicker: 0.6 },
      { x: 232, y: 26, color: MOON, radius: 170, intensity: 1.2 },
    ];

    return {
      buf,
      lights,
      ambient: [0.1, 0.13, 0.09],
      depth: { fade: 14, min: 0.08 },
      backLit: 0.85,
      grade: { tint: [0.98, 1.03, 0.94], vignette: 0.5, bloom: 1.1, threshold: 0.7, exposure: 1.3 },
      frame(b, t) {
        for (const v of roots) drawVine(b, v, t, ["#2a2014", "#3a2c1a", "#4c3a22"].map(hex), 0.3);
        drawGrass(b, reeds, t, 0.3);
        // Tar: a black, glossy skin that catches the gas light.
        for (const p of tar) if (hash2(p.x, (t * 2) | 0, seed) < 0.3) b.blend(p.x, p.y, hex("#6a7a8a"), 0.5);
        // Toxic gas pooled in the hollows: low, slow, glowing.
        plume(b, 40, 124, 22, t * 0.4, seed + 1, ["#3c8a2a", "#5cc23a", "#8bff73"].map(hex), 0.28, 0.9, 5);
        plume(b, 292, 150, 18, t * 0.4, seed + 2, ["#3c8a2a", "#5cc23a", "#8bff73"].map(hex), 0.22, 0.9, 5);
        for (let x = 0; x < 80; x++) for (let y = 112; y < 132; y++) if (!b.solidAt(x, y)) { const n = fbm(x * 0.06 + t * 0.2, y * 0.12, seed + 7, 2); if (n > 0.55) { b.blend(x, y, GAS, (n - 0.55) * 0.5, Kind.Fluid); b.glow(x, y, GAS, (n - 0.55) * 0.25); } }
        // Oil sheen on the water: rainbow streaks drifting.
        for (let x = 0; x < W; x++) {
          const n = fbm(x * 0.05 - t * 0.15, 3, seed + 11, 2);
          if (n > 0.58 && !b.solidAt(x, WATER_Y)) b.blend(x, WATER_Y, mix(hex("#8a5ad0"), hex("#5ad0a8"), (x * 0.07 + t * 0.3) % 1), 0.5);
        }
        shimmer(b, 0, W, WATER_Y, t, seed, hex("#d8e8b0"), 0.9);
        // The flare's reflection, broken up by ripples.
        for (let y = WATER_Y + 1; y < WATER_Y + 14; y++) for (let x = 194; x < 216; x++) {
          const n = fbm(x * 0.3, y * 0.6 - t * 2, seed + 13, 2), d = Math.abs(x - 204) / 11 + (y - WATER_Y) / 16;
          if (!b.solidAt(x, y) && n > 0.45 + d * 0.4) { b.blend(x, y, FLARE, 0.5 * (1 - d * 0.6)); b.glow(x, y, FLARE, 0.3 * (1 - d * 0.6)); }
        }
        // Moonlight falling through the grate: a faint shaft in the damp air.
        for (let y = 6; y < 104; y++) for (let x = 190; x < 290; x++) {
          const c = 230 + (y - 6) * 0.18, half = 8 + (y - 6) * 0.22, d = Math.abs(x - c) / half;
          if (d < 1 && !b.solidAt(x, y)) b.blend(x, y, MOON, 0.07 * (1 - d) * (0.7 + fbm(x * 0.05, y * 0.03 - t * 0.1, seed + 17, 2) * 0.6));
        }
        // Methane bubbles rising and a flare where one catches.
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.6 + i * 0.37) % 1, bx = 50 + i * 21 + Math.sin(i * 3) * 6;
          if (b.solidAt(bx, WATER_Y + 6)) continue;
          disc(bx, WATER_Y + 18 - age * 18, age < 0.95 ? 1.2 : 0, (x, y) => b.blend(x, y, hex("#a8b890"), 0.5, Kind.Fluid));
        }
        const fl = (t * 0.5) % 1;
        if (fl < 0.6) flame(b, 204, WATER_Y - 1, 5 + fl * 5, 8 * Math.sin((fl / 0.6) * Math.PI) + 2, t, seed + 5, 1.2);
        // Rings spreading from the burst bubble.
        for (const r of [fl * 16, fl * 16 - 6]) if (r > 1) for (const sgn of [-1, 1]) b.blend(204 + sgn * r, WATER_Y, hex("#ffd8a0"), 0.6 * (1 - fl));
        drawGoo(b, view, { palette: wet, t, selfLit: 2.5 });
        drawGoo(b, bit, { palette, t, selfLit: 3 });
        motes(b, 18, t, seed + 3, [0, 90, W, 60], GAS, 0.7, 3);
        // Drips from the grate.
        for (let i = 0; i < 3; i++) {
          const age = (t * 0.7 + i / 3) % 1, dx = 220 + i * 10;
          b.set(dx, 6 + age * (WATER_Y - 6), hex("#9fb8c8"), Kind.Fluid, 0);
        }
      },
    };
  },
};
