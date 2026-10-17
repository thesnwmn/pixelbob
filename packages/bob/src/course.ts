import { M, fbm, hash2, type Lamp, type World } from "@pixelbob/sim";

export interface Section { name: string; x0: number; x1: number; note: string }

export interface Course {
  lamps: Lamp[];
  spawn: { x: number; y: number };
  /** Stranded bits of Bob to collect (they count towards his total). */
  bits: { x: number; y: number; r: number }[];
  /** Reach this box with as much of Bob as you can. */
  finish: { x0: number; y0: number; x1: number; y1: number };
  sections: Section[];
  /** Where things are, for scripted runs: start a jump at these x, wait under these braziers. */
  marks: { jumps: number[]; thaw: number; melt: number; pit: number };
}

export const COURSE_W = 1640, COURSE_H = 270;

/**
 * The playground course, left to right: one thing to feel at a time, with flat ground
 * between them so each stands on its own. Heat and cold only come from things you can see
 * (ice, braziers, lava). Everything is ordinary world cells, so it can be dug and painted over.
 */
export function buildCourse(world: World, seed = 7): Course {
  const { w, h } = world;
  const G = 200;
  const set = (x: number, y: number, m: number, temp?: number) => {
    if (!world.inside(x, y)) return;
    const i = y * w + x;
    world.mat[i] = m;
    world.temp[i] = temp ?? (m === M.ice ? -20 : m === M.snow ? -10 : m === M.lava ? 1200 : world.base[i]);
    world.life[i] = 0;
    world.aux[i] = 0;
  };
  // Held at a temperature: the ice stays frozen, the lava stays molten.
  const hold = (x: number, y: number, m: number, t: number) => { set(x, y, m); world.base[y * w + x] = t; world.temp[y * w + x] = t; };

  const HILLS = 190, ROUGH = 375, STEPS = 535, ICE = 710, THAW = 900, SPIKES = 1000, LAVA = 1110, PIT = 1220, MELT = 1250, SLOT = 1290, POOL = 1350, FINISH = 1520;
  const sections: Section[] = [
    { name: "Flat", x0: 0, x1: HILLS, note: "Roll left and right; let go and he coasts." },
    { name: "Smooth hills", x0: HILLS, x1: ROUGH - 30, note: "Momentum up and over." },
    { name: "Rough ground", x0: ROUGH - 30, x1: STEPS - 30, note: "Bumps snag his underside; jagged teeth more so." },
    { name: "Steps and a gap", x0: STEPS - 30, x1: ICE - 30, note: "Hop the steps, jump the water gap. Fell in? Hold jump to swim up, let go to leap out." },
    { name: "Ice", x0: ICE - 30, x1: THAW - 40, note: "Slippery, and the cold of the ice freezes him if he lingers: slide through on momentum. Frozen? Shake left and right and tap jump to work loose." },
    { name: "Brazier", x0: THAW - 40, x1: SPIKES - 30, note: "Thaw out under the brazier: frozen, he can't jump the spikes." },
    { name: "Spikes", x0: SPIKES - 30, x1: LAVA - 30, note: "Land on them and they cut him apart." },
    { name: "Lava", x0: LAVA - 30, x1: PIT - 30, note: "Jump it. Don't fall in." },
    { name: "Pit and brazier", x0: PIT - 30, x1: SLOT - 10, note: "A lost bit of Bob is at the bottom of the pit: rolling over, you can't reach it. Melt under the brazier, come back, and hold down to pour into the pit for it." },
    { name: "Slot", x0: SLOT - 10, x1: POOL - 25, note: "Only a runny Bob oozes under the slot: get through before he cools." },
    { name: "Cliff", x0: POOL - 25, x1: POOL, note: "A sheer drop into the pool. Still runny? Ooze to the edge and dangle over it; too far and you fall (safely, into the water)." },
    { name: "Cool-off pool", x0: POOL, x1: FINISH, note: "Water cools him back down; he sinks slowly." },
    { name: "Finish", x0: FINISH, x1: w, note: "How much of Bob made it?" },
  ];

  // Ground height per column.
  const top = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let y = G;
    if (x >= HILLS && x < HILLS + 125) {
      const u = (x - HILLS) / 125;
      y = G - (u < 0.5 ? 12 : 20) * Math.sin(((u * 2) % 1) * Math.PI) ** 2;
    } else if (x >= ROUGH && x < ROUGH + 55) y = G - Math.floor(hash2(x >> 1, 1, seed) * 3);
    else if (x >= ROUGH + 55 && x < ROUGH + 100) y = G - Math.floor(hash2(x >> 2, 2, seed) ** 2 * 7);
    else if (x >= STEPS && x < STEPS + 50) y = G - 4 * Math.min(3, Math.floor((x - STEPS) / 12) + 1);
    else if (x >= STEPS + 50 && x < STEPS + 78) y = G + 24;
    else if (x >= STEPS + 78 && x < STEPS + 115) y = G - 12 + Math.max(0, x - STEPS - 93) * (12 / 22);
    else if (x >= ICE && x < ICE + 120) y = G + ((x - ICE) / 120) * 10;
    else if (x >= ICE + 120 && x < POOL) y = G + 10;
    else if (x >= POOL && x < POOL + 40) y = G + 58;
    else if (x >= POOL + 40 && x < FINISH) y = G + 58 - (x - POOL - 40) * (58 / (FINISH - POOL - 40));
    top[x] = Math.round(y);
  }

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, d = y - top[x];
      world.back[i] = 0;
      if (d < 0) { set(x, y, M.air); continue; }
      let m: number = d < 1 && (x < HILLS + 125 || x >= FINISH + 10) ? M.plant : d < 8 + fbm(x * 0.05, 1, seed, 2) * 6 ? M.dirt : M.rock;
      if (x >= ROUGH && x < ROUGH + 100 && d < 6) m = M.rock;
      // Pools are lined with rock: water soaks dirt into mud, which would eat the banks away.
      if (((x >= STEPS + 45 && x < STEPS + 83) || (x >= POOL - 5 && x < FINISH)) && m === M.dirt) m = M.rock;
      set(x, y, m);
    }

  // Pit under the gap holds water, high enough to leap out of.
  for (let y = G - 4; y < G + 24; y++) for (let x = STEPS + 50; x < STEPS + 78; x++) set(x, y, M.water);

  // Ice slab with snow drifts: the ice is the cold source.
  for (let x = ICE + 2; x < ICE + 120; x++) for (let k = 0; k < 4; k++) hold(x, top[x] + k, M.ice, -20);
  for (const [cx, r] of [[ICE + 20, 4], [ICE + 98, 3]] as const)
    for (let x = cx - r * 2; x <= cx + r * 2; x++) for (let k = 1; k <= r - Math.abs(x - cx) / 2; k++) hold(x, top[x] - k, M.snow, -10);

  // Braziers: steel bowls of lava hanging over the path from a post (drawn on the back wall).
  // They're the heat sources: stop underneath and he soaks up their heat. Don't touch the bowl.
  const brazier = (bx: number, bottom: number) => {
    for (let y = bottom - 30; y < bottom - 4; y++) world.back[y * w + bx] = 1;
    for (let x = bx; x <= bx + 14; x++) world.back[(bottom - 30) * w + x] = 1;
    for (let y = bottom - 30; y < top[bx + 14]; y++) { world.back[y * w + bx + 14] = 1; world.back[y * w + bx + 15] = 1; }
    for (let x = bx - 5; x <= bx + 5; x++) set(x, bottom, M.steel);
    for (let y = bottom - 4; y < bottom; y++) { set(bx - 5, y, M.steel); set(bx + 5, y, M.steel); }
    for (let x = bx - 4; x <= bx + 4; x++) for (let y = bottom - 3; y < bottom; y++) hold(x, y, M.lava, 1200);
  };
  brazier(THAW, G - 13);

  // Spike pit: a shallow dip lined with spikes.
  for (let x = SPIKES; x < SPIKES + 24; x++) {
    for (let y = G + 4; y < G + 10; y++) set(x, y, M.air);
    const tall = 1 + ((x - SPIKES) % 3 === 1 ? 2 : (x - SPIKES) % 3 === 0 ? 1 : 0);
    for (let k = 0; k < tall; k++) set(x, G + 9 - k, M.spike);
  }

  // Lava pit to jump, sunk so only its lip is hot.
  for (let x = LAVA; x < LAVA + 16; x++)
    for (let y = G + 4; y < G + 22; y++) {
      if (y < G + 17) set(x, y, M.air);
      else hold(x, y, M.lava, 1200);
    }

  // Stone floor through the brazier and slot.
  for (let x = PIT - 20; x < POOL; x++) for (let k = 0; k < 2; k++) set(x, G + 10 + k, M.stone);
  // A narrow pit with a lost bit of Bob at the bottom: too narrow for a round Bob to dip into.
  for (let x = PIT; x < PIT + 6; x++) for (let y = G + 10; y < G + 22; y++) set(x, y, M.air);
  brazier(MELT, G - 13);
  // The slot: a wall hanging from an overhang, leaving a gap four pixels high.
  for (let x = SLOT - 9; x < SLOT + 16; x++) for (let y = G - 40; y < G - 30; y++) set(x, y, M.rock);
  for (let x = SLOT; x < SLOT + 6; x++) for (let y = G - 30; y < G + 6; y++) set(x, y, M.steel);

  // Cool-off pool at the foot of the cliff.
  for (let x = POOL; x < FINISH; x++) for (let y = G + 40; y < top[x]; y++) set(x, y, M.water);

  // Finish flag.
  const flag = w - 30;
  for (let k = 1; k < 30; k++) set(flag, G - k, M.wood);
  for (let y = G - 29; y < G - 22; y++) for (let x = flag + 1; x < flag + 10 - (y - (G - 29)); x++) set(x, y, M.cap);

  world.wakeAll();
  return {
    lamps: [
      { x: ICE + 60, y: G - 40, color: [0.6, 0.8, 1], radius: 90 },
      { x: THAW, y: G - 13, color: [1, 0.55, 0.25], radius: 60 },
      { x: MELT, y: G - 13, color: [1, 0.55, 0.25], radius: 60 },
      { x: flag - 10, y: G - 40, color: [1, 0.82, 0.55], radius: 100 },
    ],
    spawn: { x: 40, y: G - 12 },
    finish: { x0: FINISH, y0: 0, x1: w, y1: h },
    bits: [{ x: PIT + 3, y: G + 19, r: 2 }],
    sections,
    marks: { jumps: [STEPS + 27, SPIKES - 8, LAVA - 34], thaw: THAW, melt: MELT, pit: PIT + 3 },
  };
}

export function sectionAt(course: Course, x: number): Section | undefined {
  return course.sections.find((s) => x >= s.x0 && x < s.x1);
}
