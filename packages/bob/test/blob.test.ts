import { M, World } from "@pixelbob/sim";
import { describe, expect, it } from "vitest";
import { Blob, COURSE_H, COURSE_W, DEFAULTS, buildCourse, muscleAt, runniness, type Input, type Tweaks } from "../src/index.ts";

const FLOOR = 150;
/** A wide world with a floor of `m` (and anything extra painted by `extra`). */
function ground(m: number = M.rock, extra?: (w: World) => void): World {
  const w = new World(320, 200, 1);
  for (let y = FLOOR; y < 200; y++) for (let x = 0; x < 320; x++) w.set(x, y, m);
  extra?.(w);
  return w;
}
function bob(world: World, o: Partial<Tweaks> = {}, temp: number | null = null, x = 60): Blob {
  const b = new Blob({ ...DEFAULTS, ...o });
  b.fixedTemp = temp;
  b.spawn(world, x, FLOOR - 12);
  run(b, world, 90);
  return b;
}
function run(b: Blob, world: World, steps: number, input: Input = { move: 0, jump: false }) {
  for (let i = 0; i < steps; i++) b.step(world, input);
}
function size(b: Blob) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < b.cap; i++) if (b.alive[i]) { x0 = Math.min(x0, b.x[i]); x1 = Math.max(x1, b.x[i]); y0 = Math.min(y0, b.y[i]); y1 = Math.max(y1, b.y[i]); }
  return { w: x1 - x0, h: y1 - y0 };
}
/** Hold jump for `hold` steps, release, and return how far his centre rose. */
function jump(b: Blob, world: World, hold: number): number {
  const y0 = b.main!.cy;
  let top = y0;
  run(b, world, hold, { move: 0, jump: true });
  for (let i = 0; i < 90; i++) { b.step(world, { move: 0, jump: false }); top = Math.min(top, b.main!.cy); }
  return y0 - top;
}
/** Lift every particle by dy (to drop him from a height). */
function lift(b: Blob, dy: number) {
  for (let i = 0; i < b.cap; i++) { b.y[i] -= dy; b.py[i] -= dy; }
}

describe("body", () => {
  it("holds together and settles into a dome", () => {
    const w = ground(), b = bob(w);
    expect(b.pieces.length).toBe(1);
    expect(b.count).toBe(b.total);
    const s = size(b);
    expect(s.w).toBeGreaterThan(s.h + 2);
  });

  it("is deterministic", () => {
    const a = bob(ground()), c = bob(ground());
    const wa = ground(), wc = ground();
    run(a, wa, 120, { move: 1, jump: false });
    run(c, wc, 120, { move: 1, jump: false });
    expect(a.main!.cx).toBe(c.main!.cx);
  });
});

describe("moving", () => {
  it("rolls up to speed and coasts on momentum", () => {
    const w = ground(), b = bob(w);
    run(b, w, 120, { move: 1, jump: false });
    expect(b.main!.vx).toBeGreaterThan(40);
    expect(b.pieces.length).toBe(1);
    run(b, w, 30);
    expect(b.main!.vx).toBeGreaterThan(15);
  });

  it("can't get going on ice (no grip)", () => {
    const rock = ground(), ice = ground(M.ice);
    const a = bob(rock), c = bob(ice);
    const x0 = a.main!.cx, x1 = c.main!.cx;
    run(a, rock, 60, { move: 1, jump: false });
    run(c, ice, 60, { move: 1, jump: false });
    expect(c.main!.cx - x1).toBeLessThan((a.main!.cx - x0) * 0.4);
  });

  it("jumps out of water, but not as high as off the ground", () => {
    const pool = (w: World) => { for (let y = FLOOR - 30; y < FLOOR; y++) for (let x = 0; x < 320; x++) w.set(x, y, M.water); };
    const w = ground(M.rock, pool), b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 14);
    run(b, w, 120);
    expect(b.main!.cy).toBeGreaterThan(FLOOR - 15); // sank
    // Hold to swim up, let go at the surface to leap.
    let top = Infinity;
    for (let i = 0; i < 240; i++) {
      b.step(w, { move: 0, jump: b.main!.wet > 0.2 });
      top = Math.min(top, b.main!.cy);
    }
    const waterLeap = FLOOR - 30 - top;
    expect(waterLeap).toBeGreaterThan(4);
    const g = ground();
    expect(jump(bob(g), g, 30)).toBeGreaterThan(waterLeap * 1.5);
  });

  it("charging a jump makes it higher", () => {
    const tap = jump(bob(ground()), ground(), 3);
    const w = ground();
    const full = jump(bob(w), w, 30);
    expect(tap).toBeGreaterThan(8);
    expect(full).toBeGreaterThan(tap * 1.8);
  });
});

describe("temperature", () => {
  it("frozen solid he can neither roll nor jump", () => {
    const w = ground(), b = bob(w, {}, -20);
    const x0 = b.main!.cx;
    run(b, w, 60, { move: 1, jump: false });
    expect(Math.abs(b.main!.cx - x0)).toBeLessThan(1);
    expect(jump(b, w, 20)).toBeLessThan(1);
  });

  it("frozen, he slides across ice in one piece, and thaws back into a blob", () => {
    const w = ground(M.ice), b = bob(w);
    run(b, w, 60, { move: 1, jump: false });
    b.fixedTemp = -20;
    run(b, w, 120, { move: 1, jump: false });
    expect(b.pieces.length).toBe(1);
    let fast = 0;
    for (let i = 0; i < b.cap; i++) if (b.alive[i]) fast = Math.max(fast, Math.hypot(b.vx[i] - b.main!.vx, b.vy[i] - b.main!.vy));
    expect(fast).toBeLessThan(60); // rigid: no particle racing round him
    b.fixedTemp = 20;
    run(b, w, 240);
    const s = size(b);
    expect(b.pieces.length).toBe(1);
    expect(s.w).toBeGreaterThan(s.h + 2);
    expect(s.w).toBeLessThan(28);
  });

  it("frozen on a gentle ice slope he drifts slowly downhill, and never flies off", () => {
    // A staircase slope, 1 px down every 12 px (like the course's ice).
    const w = new World(320, 200, 1);
    for (let x = 0; x < 320; x++) for (let y = 120 + Math.floor(x / 12); y < 200; y++) w.set(x, y, M.ice);
    const b = new Blob(DEFAULTS);
    b.fixedTemp = -20;
    b.spawn(w, 100, 110);
    let fastest = 0, x0 = 0;
    for (let i = 0; i < 300; i++) {
      b.step(w, { move: 0, jump: false });
      if (i === 60) x0 = b.main!.cx;
      fastest = Math.max(fastest, Math.hypot(b.main!.vx, b.main!.vy));
    }
    expect(b.main!.cx).toBeGreaterThan(x0 + 5); // downhill is to the right
    expect(fastest).toBeLessThan(120);
    expect(b.pieces.length).toBe(1);
  });

  it("frozen, a drop cracks him into chunks; at room temperature he survives it", () => {
    const w1 = ground(), cold = bob(w1, {}, -20);
    lift(cold, 40);
    run(cold, w1, 90);
    expect(cold.pieces.length).toBeGreaterThan(1);
    expect(cold.main!.len).toBeGreaterThan(cold.total * 0.2); // chunks, not crumbs
    const w2 = ground(), warm = bob(w2);
    lift(warm, 40);
    run(warm, w2, 90);
    expect(warm.pieces.length).toBe(1);
  });

  it("runny Bob pours through a slot that stops him at room temperature", () => {
    const slot = (w: World) => { for (let x = 100; x < 106; x++) for (let y = 0; y < FLOOR - 4; y++) w.set(x, y, M.steel); };
    const past = (b: Blob) => b.countIn(106, 0, 320, 200) / b.count;
    const w1 = ground(M.rock, slot), normal = bob(w1);
    run(normal, w1, 400, { move: 1, jump: false });
    expect(past(normal)).toBe(0);
    const w2 = ground(M.rock, slot), hot = bob(w2, {}, 80);
    run(hot, w2, 400, { move: 1, jump: false });
    expect(past(hot)).toBeGreaterThan(0.9);
    expect(hot.pieces.length).toBe(1);
  });

  it("a heat source warms his near side first, then all of him, and he holds it after", () => {
    // A bowl of lava hanging just over him, held hot like a brazier.
    const w = ground(M.rock, (w) => {
      for (let x = 55; x <= 65; x++) for (let y = FLOOR - 26; y < FLOOR - 23; y++) { w.set(x, y, M.lava); w.base[y * w.w + x] = 1200; w.temp[y * w.w + x] = 1200; }
    });
    const b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 12);
    run(b, w, 30);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < b.cap; i++) if (b.alive[i]) { lo = Math.min(lo, b.t[i]); hi = Math.max(hi, b.t[i]); }
    expect(hi - lo).toBeGreaterThan(8); // the side facing it is warmer
    run(b, w, 240);
    expect(b.main!.temp).toBeGreaterThan(55); // runny all through
    expect(b.losses.boiled).toBe(0); // radiated heat alone doesn't boil him
    for (let x = 55; x <= 65; x++) for (let y = FLOOR - 26; y < FLOOR - 23; y++) { w.set(x, y, M.air); w.base[y * w.w + x] = 20; }
    run(b, w, 300);
    expect(b.main!.temp).toBeGreaterThan(50); // five seconds later he's still warm
  });

  it("shaking and tapping jump loosens a frozen Bob a little; sitting still doesn't", () => {
    const shake = (struggle: boolean) => {
      const w = ground(), b = new Blob(DEFAULTS);
      b.spawn(w, 60, FLOOR - 12, -20);
      for (let f = 0; f < 180; f++) b.step(w, struggle ? { move: Math.floor(f / 8) % 2 ? 1 : -1, jump: f % 20 < 3 } : { move: 0, jump: false });
      return b.main!.temp;
    };
    const shaken = shake(true), still = shake(false);
    expect(muscleAt(shaken)).toBeGreaterThan(0.3);
    expect(shaken).toBeLessThan(2); // only loosened, not thawed
    expect(muscleAt(still)).toBe(0);
  });

  it("runny, he clings and can hang down off a ledge", () => {
    const w = new World(300, 300, 1);
    for (let y = 100; y < 110; y++) for (let x = 0; x < 120; x++) w.set(x, y, M.rock);
    const b = new Blob(DEFAULTS);
    b.fixedTemp = 80;
    b.spawn(w, 95, 88);
    for (let f = 0; f < 240; f++) {
      let edge = 0;
      for (let i = 0; i < b.cap; i++) if (b.alive[i]) edge = Math.max(edge, b.x[i]);
      b.step(w, { move: edge < 136 ? 0.5 : 0, jump: false });
    }
    let below = 0;
    for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.y[i] > 110) below++;
    expect(below).toBeGreaterThan(50); // hanging down past the ledge
    expect(b.main!.cy).toBeLessThan(115); // but still holding on
  });

  it("on the course, a round Bob rolls over the pit's lost bit; a runny one pours in for it", () => {
    const attempt = (runny: boolean) => {
      const world = new World(COURSE_W, COURSE_H, 7);
      const course = buildCourse(world), pit = course.marks.pit;
      const b = new Blob(DEFAULTS);
      if (runny) b.fixedTemp = 80;
      b.spawn(world, runny ? pit + 15 : pit - 40, 195, 20, course.bits);
      for (let f = 0; f < 300; f++) {
        const p = b.main!;
        let left = Infinity;
        for (let k = p.start; k < p.start + p.len; k++) left = Math.min(left, b.x[b.order[k]]);
        const move = runny ? (left > pit - 6 ? -0.5 : 0) : 1;
        world.step();
        b.step(world, { move, jump: false, down: runny && f > 90 ? 1 : 0 });
      }
      return b.main!.len === b.total;
    };
    expect(attempt(false)).toBe(false);
    expect(attempt(true)).toBe(true);
  });

  it("after melting and setting again he's a round Bob that rolls", () => {
    const w = ground(), b = bob(w);
    b.fixedTemp = 80;
    for (let f = 0; f < 240; f++) b.step(w, { move: f % 120 < 60 ? 1 : -1, jump: false, down: f % 80 < 20 ? 1 : 0 });
    b.fixedTemp = 20;
    run(b, w, 240);
    const s = size(b);
    expect(s.h).toBeGreaterThan(11); // not a puddle or a slab
    const x0 = b.main!.cx;
    run(b, w, 120, { move: 1, jump: false });
    expect(b.main!.cx - x0).toBeGreaterThan(60);
  });

  it("frozen, he freezes the water around him", () => {
    const w = ground(M.rock, (w) => { for (let y = FLOOR - 30; y < FLOOR; y++) for (let x = 0; x < 320; x++) w.set(x, y, M.water); });
    const b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 40, -25);
    for (let f = 0; f < 240; f++) { w.step(); b.step(w, { move: 0, jump: false }); }
    expect(w.count(M.ice)).toBeGreaterThan(50);
  });

  it("boils away on lava", () => {
    const w = ground(M.rock, (w) => { for (let x = 40; x < 90; x++) for (let y = FLOOR - 4; y < FLOOR; y++) w.set(x, y, M.lava); });
    const b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 20);
    run(b, w, 240);
    expect(b.losses.boiled).toBeGreaterThan(b.total * 0.3);
  });
});

describe("tearing", () => {
  it("spikes slice him into a few pieces, not crumbs", () => {
    const w = ground(M.rock, (w) => { for (let x = 30; x < 90; x += 2) for (let y = FLOOR - 3; y < FLOOR; y++) w.set(x, y, M.spike); });
    const b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 40);
    run(b, w, 120);
    expect(b.pieces.length).toBeGreaterThan(1);
    expect(b.main!.len).toBeGreaterThan(b.total * 0.2);
    let fast = 0;
    for (let i = 0; i < b.cap; i++) if (b.alive[i]) fast = Math.max(fast, Math.hypot(b.vx[i], b.vy[i]));
    expect(fast).toBeLessThan(100); // the bits settle instead of buzzing about
  });

  it("cohesion decides whether a hard landing splashes bits off", () => {
    const drop = (cohesion: number) => {
      const w = ground(), b = bob(w, { cohesion });
      lift(b, 80);
      run(b, w, 60);
      return b.pieces.length;
    };
    expect(drop(0)).toBeGreaterThan(3);
    expect(drop(1)).toBe(1);
  });

  it("after spikes cut him, he re-forms into a round Bob that rolls again", () => {
    const spikes = (w: World, m: number) => { for (let x = 40; x < 80; x += 2) for (let y = FLOOR - 3; y < FLOOR; y++) w.set(x, y, m); };
    const w = ground(M.rock, (w) => spikes(w, M.spike)), b = new Blob(DEFAULTS);
    b.spawn(w, 60, FLOOR - 50);
    run(b, w, 90);
    expect(b.pieces.length).toBeGreaterThan(1);
    spikes(w, M.air);
    run(b, w, 180);
    const p = b.main!, x0 = p.cx;
    run(b, w, 120, { move: 1, jump: false });
    expect(b.main!.cx - x0).toBeGreaterThan(40);
    // Not stuck flat: about as tall for his size as a fresh Bob.
    let y0 = Infinity, y1 = -Infinity;
    const q = b.main!;
    for (let k = q.start; k < q.start + q.len; k++) { const i = b.order[k]; y0 = Math.min(y0, b.y[i]); y1 = Math.max(y1, b.y[i]); }
    expect(y1 - y0).toBeGreaterThan(Math.sqrt(q.len / Math.PI) * 1.4);
  });

  it("torn-off bits rejoin when they touch", () => {
    const w = ground(), b = bob(w, { cohesion: 0 });
    lift(b, 80);
    run(b, w, 60);
    const torn = b.pieces.length;
    b.tweaks.cohesion = 1;
    run(b, w, 300);
    expect(b.pieces.length).toBeLessThan(torn);
  });
});

describe("course", () => {
  it("a scripted run gets most of him to the finish", () => {
    const world = new World(COURSE_W, COURSE_H, 7);
    const course = buildCourse(world);
    const b = new Blob(DEFAULTS);
    b.spawn(world, course.spawn.x, course.spawn.y);
    const { jumps, thaw, melt } = course.marks, end = course.finish.x0 + 40;
    let hold = 0;
    for (let f = 0; f < 60 * 60 && b.main!.cx < end; f++) {
      const p = b.main!;
      // Wind up just before the gap, the spike pit and the lava pit; swim when in water;
      // thaw under the first brazier and melt under the second.
      if (!hold && jumps.some((x) => Math.abs(p.cx - x) < 2)) hold = 20;
      if (hold) hold--;
      const wait = (Math.abs(p.cx - thaw) < 4 && p.temp < 15) || (Math.abs(p.cx - melt) < 4 && runniness(p.temp) < 0.9);
      world.step();
      b.step(world, { move: wait ? 0 : 1, jump: hold > 0 || p.wet > 0.2 });
    }
    expect(b.main!.cx).toBeGreaterThan(end);
    expect(b.countIn(course.finish.x0, 0, COURSE_W, COURSE_H) / b.total).toBeGreaterThan(0.5);
  }, 60_000);
});
