import { M, fbm, hash2, type Lamp, type World } from "@pixelbob/sim";

export interface Section { name: string; x0: number; x1: number; note: string }

export interface Course {
  lamps: Lamp[];
  spawn: { x: number; y: number };
  /** Reach this box with as much of Bob as you can. */
  finish: { x0: number; y0: number; x1: number; y1: number };
  sections: Section[];
}

export const COURSE_W = 960, COURSE_H = 270;

/**
 * The playground course, left to right: one thing to feel at a time.
 * Everything is ordinary world cells, so it can be dug and painted over.
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
  const sections: Section[] = [
    { name: "Flat", x0: 0, x1: 110, note: "Roll left and right; let go and he coasts." },
    { name: "Smooth hills", x0: 110, x1: 235, note: "Momentum up and over." },
    { name: "Rough ground", x0: 235, x1: 335, note: "Bumps snag his underside; jagged teeth more so." },
    { name: "Steps and a gap", x0: 335, x1: 450, note: "Hop the steps, jump the water gap. Fell in? Hold jump to swim up, let go to leap out." },
    { name: "Ice, cold air", x0: 450, x1: 572, note: "Slippery, and the cold freezes him if he stops: keep moving (he shivers) or slide through on momentum." },
    { name: "Warm patch", x0: 572, x1: 612, note: "Thaw out here: frozen, he can't jump the spikes." },
    { name: "Spikes", x0: 612, x1: 655, note: "Land on them and they cut him apart." },
    { name: "Heat and a slot", x0: 655, x1: 795, note: "Hop the lava; warm air makes him runny enough to pour through the slot." },
    { name: "Cool-off pool", x0: 795, x1: 860, note: "Water cools him back down; he sinks slowly." },
    { name: "Finish", x0: 860, x1: 960, note: "How much of Bob made it?" },
  ];

  // Ground height per column.
  const top = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let y = G;
    if (x >= 110 && x < 235) {
      const u = (x - 110) / 125;
      y = G - (u < 0.5 ? 12 : 20) * Math.sin(((u * 2) % 1) * Math.PI) ** 2;
    } else if (x >= 235 && x < 290) y = G - Math.floor(hash2(x >> 1, 1, seed) * 3);
    else if (x >= 290 && x < 335) y = G - Math.floor(hash2(x >> 2, 2, seed) ** 2 * 7);
    else if (x >= 335 && x < 385) y = G - 4 * Math.min(3, Math.floor((x - 335) / 12) + 1);
    else if (x >= 385 && x < 413) y = G + 24;
    else if (x >= 413 && x < 450) y = G - 12 + Math.max(0, x - 428) * (12 / 22);
    else if (x >= 450 && x < 570) y = G + ((x - 450) / 120) * 10;
    else if (x >= 570 && x < 795) y = G + 10;
    else if (x >= 795 && x < 825) y = G + 20;
    else if (x >= 825 && x < 875) y = G + 20 - (x - 825) * (20 / 50);
    else y = G;
    top[x] = Math.round(y);
  }

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, d = y - top[x];
      world.back[i] = 0;
      if (d < 0) { set(x, y, M.air); continue; }
      let m: number = d < 1 && (x < 235 || x >= 900) ? M.plant : d < 8 + fbm(x * 0.05, 1, seed, 2) * 6 ? M.dirt : M.rock;
      if (x >= 235 && x < 335 && d < 6) m = M.rock;
      set(x, y, m);
    }

  // Pit under the gap holds water, high enough to leap out of.
  for (let y = G - 4; y < G + 24; y++) for (let x = 385; x < 413; x++) set(x, y, M.water);

  // Ice slab with snow drifts, in a cold pocket of air.
  for (let x = 452; x < 570; x++) for (let k = 0; k < 4; k++) set(x, top[x] + k, M.ice);
  for (const [cx, r] of [[470, 4], [548, 3]] as const)
    for (let x = cx - r * 2; x <= cx + r * 2; x++) for (let k = 1; k <= r - Math.abs(x - cx) / 2; k++) set(x, top[x] - k, M.snow);
  for (let y = 0; y < h; y++)
    for (let x = 458; x < 572; x++) {
      const i = y * w + x;
      if (y > top[x] + 6) continue;
      world.base[i] = -15;
      world.temp[i] = world.mat[i] === M.ice ? -20 : -15;
    }
  // Warm patch to thaw out in.
  for (let y = G - 50; y <= G + 9; y++)
    for (let x = 576; x < 610; x++) {
      const i = y * w + x;
      if (world.mat[i] !== M.air) continue;
      world.base[i] = 70;
      world.temp[i] = 70;
    }

  // Spike pit: a shallow dip lined with spikes.
  for (let x = 620; x < 644; x++) {
    for (let y = G + 4; y < G + 10; y++) set(x, y, M.air);
    const tall = 1 + ((x - 620) % 3 === 1 ? 2 : (x - 620) % 3 === 0 ? 1 : 0);
    for (let k = 0; k < tall; k++) set(x, G + 9 - k, M.spike);
  }

  // Lava pit, then hot air over a steel floor, then a slot under a hanging wall.
  // The lava pit is held hot by its cells' ambient temperature, so it never crusts over.
  for (let x = 674; x < 690; x++)
    for (let y = G + 4; y < G + 18; y++) {
      if (y >= G + 8) world.base[y * w + x] = 1200;
      set(x, y, y < G + 8 ? M.air : M.lava);
    }
  for (let x = 690; x < 795; x++) for (let k = 0; k < 2; k++) set(x, G + 10 + k, M.stone);
  for (let y = 0; y < h; y++)
    for (let x = 700; x < 790; x++) {
      const i = y * w + x;
      if (world.mat[i] !== M.air || y < G - 60) continue;
      world.base[i] = 90;
      world.temp[i] = 90;
    }
  for (let x = 735; x < 760; x++) for (let y = G - 40; y < G - 30; y++) set(x, y, M.rock);
  for (let x = 744; x < 750; x++) for (let y = G - 30; y < G + 6; y++) set(x, y, M.steel);

  // Cool-off pool, level with the hot floor.
  for (let x = 795; x < 875; x++) for (let y = G + 10; y < top[x]; y++) set(x, y, M.water);

  // Finish flag.
  for (let k = 1; k < 30; k++) set(940, G - k, M.wood);
  for (let y = G - 29; y < G - 22; y++) for (let x = 941; x < 950 - (y - (G - 29)); x++) set(x, y, M.cap);

  world.wakeAll();
  return {
    lamps: [
      { x: 510, y: G - 40, color: [0.6, 0.8, 1], radius: 90 },
      { x: 592, y: G - 6, color: [1, 0.55, 0.25], radius: 60 },
      { x: 745, y: G - 20, color: [1, 0.6, 0.35], radius: 80 },
      { x: 930, y: G - 40, color: [1, 0.82, 0.55], radius: 100 },
    ],
    spawn: { x: 40, y: G - 12 },
    finish: { x0: 870, y0: 0, x1: w, y1: h },
    sections,
  };
}

export function sectionAt(course: Course, x: number): Section | undefined {
  return course.sections.find((s) => x >= s.x0 && x < s.x1);
}
