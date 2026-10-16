import { Buf, Kind } from "./buf.ts";
import { hex, type RGB } from "./color.ts";
import { hash2 } from "./rng.ts";

/**
 * The material palette. Each material is a short ramp of colours; a pixel picks
 * one by hash so surfaces have grain without noise textures. These are the
 * proposed in-game colours too (docs/02-art-direction.md).
 */
export interface Material {
  name: string;
  ramp: RGB[];
  kind: Kind;
  occ: number;
  /** Emission added on top of the lit colour (molten metal, glow goo). */
  emit?: RGB;
  /** Fluids are drawn translucent over the back wall. */
  alpha?: number;
}

const m = (name: string, ramp: string[], kind: Kind, occ: number, extra: Partial<Material> = {}): Material => ({
  name, ramp: ramp.map(hex), kind, occ, ...extra,
});

export const MAT = {
  rock: m("rock", ["#3b342f", "#463e37", "#52483f", "#5e5348"], Kind.Solid, 0.55),
  stone: m("stone", ["#272a31", "#30343d", "#3a3f4a", "#454b58"], Kind.Solid, 0.55),
  dirt: m("dirt", ["#3f281d", "#4d3122", "#5c3b28", "#6a4530"], Kind.Solid, 0.55),
  grass: m("grass", ["#3a7a2c", "#4f9a35", "#6dbb41", "#93d653"], Kind.Solid, 0.4),
  sand: m("sand", ["#b8945c", "#c9a66b", "#d8b97c", "#e6cb92"], Kind.Solid, 0.5),
  ice: m("ice", ["#7fb9da", "#9fd3ee", "#bfe6f7", "#e2f6ff"], Kind.Solid, 0.22),
  snow: m("snow", ["#c9d8e6", "#dbe6f0", "#ecf3f9"], Kind.Solid, 0.5),
  metal: m("metal", ["#363b43", "#41474f", "#4d545e", "#5b636e"], Kind.Solid, 0.7),
  steel: m("steel", ["#59616c", "#6a7380", "#7d8794", "#929cab"], Kind.Solid, 0.7),
  rust: m("rust", ["#5e3220", "#6f3d26", "#83492b", "#965632"], Kind.Solid, 0.7),
  brick: m("brick", ["#4e2721", "#5d3028", "#6b3a2f"], Kind.Solid, 0.6),
  wood: m("wood", ["#4f331f", "#5f3e25", "#714b2c", "#855a33"], Kind.Solid, 0.6),
  water: m("water", ["#1d4c86", "#225797", "#2a64a8"], Kind.Fluid, 0.12, { alpha: 0.72 }),
  molten: m("molten", ["#ff5a1a", "#ff7a1c", "#ffa12a", "#ffd05a"], Kind.Fluid, 0.3, { emit: hex("#ff6a20"), alpha: 1 }),
  lava: m("lava", ["#c2260f", "#e24a14", "#ff7a1c", "#ffb340"], Kind.Fluid, 0.3, { emit: hex("#ff4a14"), alpha: 1 }),
  goo: m("glow goo", ["#1fb7a0", "#2fd8bd", "#5ff2d8"], Kind.Fluid, 0.1, { emit: hex("#2fe0c4"), alpha: 0.85 }),
  oil: m("oil", ["#16121c", "#1f1928", "#2a2236"], Kind.Fluid, 0.4, { alpha: 0.92 }),
  toxic: m("toxic gas", ["#6fe85a", "#8bff73"], Kind.Fluid, 0.02, { emit: hex("#4cff40"), alpha: 0.25 }),
  steam: m("steam", ["#cfdbe4", "#e3ecf2"], Kind.Fluid, 0.05, { alpha: 0.3 }),
  smoke: m("smoke", ["#2c2a2e", "#3a373c", "#48444a"], Kind.Fluid, 0.08, { alpha: 0.45 }),
  crystal: m("crystal", ["#6a3fc0", "#8a5ae0", "#b48cff", "#e0cfff"], Kind.Solid, 0.3, { emit: hex("#7a48ff") }),
} satisfies Record<string, Material>;

export type MatName = keyof typeof MAT;

/** Paint one pixel of a material. `shade` in [0,1] biases towards the dark/light end of the ramp. */
export function paint(buf: Buf, x: number, y: number, mat: Material, shade = 0.5, seed = 1, glowK = 0): void {
  const h = hash2(x, y, seed);
  const t = Math.max(0, Math.min(0.999, shade + (h - 0.5) * 0.5));
  const c = mat.ramp[Math.floor(t * mat.ramp.length)];
  if (mat.alpha !== undefined && mat.alpha < 1) buf.blend(x, y, c, mat.alpha, mat.kind, mat.occ);
  else buf.set(x, y, c, mat.kind, mat.occ);
  if (mat.emit && glowK > 0) buf.glow(x, y, mat.emit, glowK * (0.7 + h * 0.6));
}
