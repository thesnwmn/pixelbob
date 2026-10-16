/**
 * The material table. Behaviour is data: the world step only knows categories
 * (powder, liquid, gas, fire, static) and reads every number from here.
 * Colours match the art direction palette in prototypes/00-stills/src/kit/materials.ts.
 */

export const Cat = {
  Empty: 0,
  Static: 1,
  Powder: 2,
  Liquid: 3,
  Gas: 4,
  Fire: 5,
} as const;
export type Cat = (typeof Cat)[keyof typeof Cat];

export interface MatDef {
  id: number;
  name: string;
  cat: Cat;
  /** Heavier sinks through lighter. Air is 1: gases below 1 rise, above 1 sink. */
  density: number;
  /** Liquids: how many cells sideways they can flow per step. */
  flow: number;
  /** Chance per step that a fluid or powder bothers to move (viscosity, stickiness). */
  mobility: number;
  /** Fraction of the temperature difference with neighbours taken per step. */
  conduct: number;
  /** Chance per step to catch fire from a burning neighbour (0 = never). */
  flammable: number;
  /** Ignites by itself above this temperature. */
  ignite: number;
  /** Fire made from this material lasts about this many steps. */
  burnTime: number;
  /** Temperature a freshly placed cell starts at. */
  spawnTemp: number;
  /** Acid eats it with this chance per contact. */
  dissolve: number;
  /** Light blocked per cell, 0..1. */
  occ: number;
  /** Emitted light, 0..1 per channel (multiplied by the renderer). */
  emit: [number, number, number];
  /** Colour ramp as 0xRRGGBB. */
  colors: number[];
  /** Fluids and gases are drawn translucent over what's behind them. */
  alpha: number;
  /** Shown in the sandbox palette. */
  palette: boolean;
}

const defaults: Omit<MatDef, "id" | "name" | "cat" | "colors"> = {
  density: 1000, flow: 0, mobility: 1, conduct: 0.08, flammable: 0, ignite: Infinity, burnTime: 30,
  spawnTemp: 20, dissolve: 0, occ: 0.55, emit: [0, 0, 0], alpha: 1, palette: true,
};

const list: MatDef[] = [];
function def(name: string, cat: Cat, colors: number[], o: Partial<MatDef> = {}): number {
  const id = list.length;
  list.push({ ...defaults, id, name, cat, colors, ...o });
  return id;
}

// Order matters only for ids; keep air at 0.
export const M = {
  air: def("air", Cat.Empty, [0], { density: 1, conduct: 0.04, occ: 0, palette: false }),
  rock: def("rock", Cat.Static, [0x3b342f, 0x463e37, 0x52483f, 0x5e5348]),
  dirt: def("dirt", Cat.Static, [0x3f281d, 0x4d3122, 0x5c3b28, 0x6a4530], { dissolve: 0.3 }),
  sand: def("sand", Cat.Powder, [0xb8945c, 0xc9a66b, 0xd8b97c, 0xe6cb92], { density: 20, dissolve: 0.2, occ: 0.5 }),
  water: def("water", Cat.Liquid, [0x1d4c86, 0x225797, 0x2a64a8], { density: 10, flow: 5, conduct: 0.15, occ: 0.12, alpha: 0.78 }),
  oil: def("oil", Cat.Liquid, [0x1f1928, 0x2a2236, 0x342a42], { density: 8, flow: 3, mobility: 0.8, flammable: 0.5, ignite: 220, burnTime: 40, occ: 0.4, alpha: 0.92 }),
  lava: def("lava", Cat.Liquid, [0xc2260f, 0xe24a14, 0xff7a1c, 0xffb340], { density: 30, flow: 1, mobility: 0.25, conduct: 0.01, spawnTemp: 1200, occ: 0.3, emit: [1, 0.35, 0.08] }),
  ice: def("ice", Cat.Static, [0x7fb9da, 0x9fd3ee, 0xbfe6f7, 0xe2f6ff], { conduct: 0.006, spawnTemp: -20, dissolve: 0.3, occ: 0.22 }),
  snow: def("snow", Cat.Powder, [0xc9d8e6, 0xdbe6f0, 0xecf3f9], { density: 6, mobility: 0.6, conduct: 0.01, spawnTemp: -10, dissolve: 0.5, occ: 0.45 }),
  wood: def("wood", Cat.Static, [0x4f331f, 0x5f3e25, 0x714b2c, 0x855a33], { flammable: 0.08, ignite: 300, burnTime: 120, conduct: 0.03, dissolve: 0.15, occ: 0.6 }),
  steel: def("steel", Cat.Static, [0x59616c, 0x6a7380, 0x7d8794, 0x929cab], { conduct: 0.45, dissolve: 0.01, occ: 0.7 }),
  plant: def("plant", Cat.Static, [0x2f6e2a, 0x3f8a30, 0x57a838, 0x7cc94a], { flammable: 0.15, ignite: 150, burnTime: 25, conduct: 0.05, dissolve: 0.5, occ: 0.3 }),
  steam: def("steam", Cat.Gas, [0xc3ccd4, 0xd5dde4, 0xe3e9ee], { density: 0.4, mobility: 0.8, spawnTemp: 110, occ: 0.05, alpha: 0.4 }),
  smoke: def("smoke", Cat.Gas, [0x2c2a2e, 0x3a373c, 0x48444a], { density: 0.7, mobility: 0.7, occ: 0.1, alpha: 0.5 }),
  fire: def("fire", Cat.Fire, [0xff7a1c, 0xffb53a, 0xffe58a], { density: 0.3, spawnTemp: 700, conduct: 0.3, occ: 0, emit: [1, 0.55, 0.15] }),
  goo: def("glow goo", Cat.Liquid, [0x1fb7a0, 0x2fd8bd, 0x5ff2d8], { density: 12, flow: 2, mobility: 0.6, occ: 0.1, emit: [0.1, 0.8, 0.65], alpha: 0.85 }),
  toxic: def("toxic gas", Cat.Gas, [0x5fd84a, 0x6fe85a, 0x8bff73], { density: 1.6, mobility: 0.5, flammable: 1, ignite: 400, burnTime: 6, occ: 0.02, emit: [0.15, 0.6, 0.1], alpha: 0.35 }),
  acid: def("acid", Cat.Liquid, [0x9ad820, 0xb0ec30, 0xc8ff50], { density: 11, flow: 3, occ: 0.12, emit: [0.15, 0.3, 0], alpha: 0.8 }),
  ash: def("ash", Cat.Powder, [0x4a4644, 0x5a5552, 0x6a6460], { density: 11, mobility: 0.7, dissolve: 0.5, occ: 0.5 }),
  stone: def("stone", Cat.Static, [0x272a31, 0x30343d, 0x3a3f4a], { conduct: 0.1, palette: false }),
  spore: def("spores", Cat.Powder, [0x7fe8d8, 0xa8fff0, 0xd0fff8], { density: 1.3, mobility: 0.3, flammable: 0.5, ignite: 120, burnTime: 4, dissolve: 1, occ: 0.02, emit: [0.05, 0.35, 0.3] }),
  stem: def("stem", Cat.Static, [0x8aa8a0, 0xa8c4bc, 0xc0d8d0], { flammable: 0.12, ignite: 180, burnTime: 30, conduct: 0.04, dissolve: 0.6, occ: 0.25, emit: [0.03, 0.12, 0.1], palette: false }),
  cap: def("cap", Cat.Static, [0x1fb7a0, 0x3ff0d8, 0x7ffff0, 0xc8fff8], { flammable: 0.1, ignite: 180, burnTime: 30, conduct: 0.04, dissolve: 0.6, occ: 0.2, emit: [0.06, 0.45, 0.4], palette: false }),
  gunpowder: def("gunpowder", Cat.Powder, [0x55555c, 0x64646b, 0x74747a, 0x9a8a5a], { density: 18, flammable: 1, ignite: 180, dissolve: 0.5, occ: 0.5 }),
  methane: def("methane", Cat.Gas, [0x9a8ab8, 0xb0a0d0], { density: 0.6, mobility: 0.6, flammable: 1, ignite: 250, burnTime: 3, occ: 0.01, alpha: 0.22 }),
  mud: def("mud", Cat.Liquid, [0x3a2a1e, 0x45321f, 0x503a24], { density: 14, flow: 1, mobility: 0.15, conduct: 0.1, dissolve: 0.3, occ: 0.6 }),
  salt: def("salt", Cat.Powder, [0xd8d8d0, 0xe8e8e0, 0xf4f4ee], { density: 21, occ: 0.45 }),
  brine: def("brine", Cat.Liquid, [0x2a6a8a, 0x307898, 0x3a86a6], { density: 11, flow: 4, conduct: 0.15, occ: 0.12, alpha: 0.78 }),
  vine: def("vine", Cat.Static, [0x1d4f45, 0x26685a, 0x2f8270], { flammable: 0.15, ignite: 150, burnTime: 25, conduct: 0.05, dissolve: 0.5, occ: 0.3 }),
  rust: def("rust", Cat.Static, [0x6f3d26, 0x83492b, 0x965632], { conduct: 0.2, dissolve: 0.4, occ: 0.7 }),
  flakes: def("rust flakes", Cat.Powder, [0x7a4428, 0x8e5230, 0xa0603a], { density: 15, dissolve: 0.6, occ: 0.5, palette: false }),
  rubble: def("rubble", Cat.Powder, [0x4a423b, 0x5a5048, 0x6a5e54], { density: 22, occ: 0.55, palette: false }),
  glass: def("glass", Cat.Static, [0x9fc4c8, 0xb8dadc, 0xd0eef0], { conduct: 0.1, occ: 0.08, palette: false }),
} as const;
export type MatId = (typeof M)[keyof typeof M];

export const MATS: readonly MatDef[] = list;

// Hot paths read these flat arrays instead of objects.
export const CAT = Uint8Array.from(list, (m) => m.cat);
export const DENSITY = Float32Array.from(list, (m) => m.density);
export const FLOW = Uint8Array.from(list, (m) => m.flow);
export const MOBILITY = Float32Array.from(list, (m) => m.mobility);
export const CONDUCT = Float32Array.from(list, (m) => m.conduct);
export const FLAMMABLE = Float32Array.from(list, (m) => m.flammable);
export const IGNITE = Float32Array.from(list, (m) => m.ignite);
export const DISSOLVE = Float32Array.from(list, (m) => m.dissolve);

export const AMBIENT = 20;
