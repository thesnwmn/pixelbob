import { M, World } from "@pixelbob/sim";
import { describe, expect, it } from "vitest";
import { COURSE_H, COURSE_W, DEFAULTS, MODELS, buildCourse, createBob, muscleAt, runniness, type BobModel, type Input, type ModelKind, type Tweaks } from "../src/index.ts";

const FLOOR = 150;
/** A wide world with a floor of `m` (and anything extra painted by `extra`). */
function ground(m: number = M.rock, extra?: (w: World) => void): World {
  const w = new World(320, 200, 1);
  for (let y = FLOOR; y < 200; y++) for (let x = 0; x < 320; x++) w.set(x, y, m);
  extra?.(w);
  return w;
}
function run(b: BobModel, world: World, steps: number, input: Input = { move: 0, jump: false }) {
  for (let i = 0; i < steps; i++) b.step(world, input);
}
/** Every particle of him: position, velocity, temperature, and which piece. */
function each(b: BobModel, f: (x: number, y: number, vx: number, vy: number, t: number, piece: number) => void) {
  const v = b.view();
  v.pieces.forEach((p, pi) => { for (let k = p.start; k < p.start + p.len; k++) { const i = v.order[k]; f(v.x[i], v.y[i], v.vx[i], v.vy[i], v.t[i], pi); } });
}
function size(b: BobModel, piece = -1) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  each(b, (x, y, _vx, _vy, _t, p) => { if (piece < 0 || p === piece) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  return { w: x1 - x0, h: y1 - y0, x1 };
}
/** Fastest any particle moves relative to its piece. */
function churn(b: BobModel) {
  let fast = 0;
  each(b, (_x, _y, vx, vy, _t, p) => { const q = b.pieces[p]; fast = Math.max(fast, Math.hypot(vx - q.vx, vy - q.vy)); });
  return fast;
}

describe.each(MODELS.map((m) => m.kind))("%s", (kind: ModelKind) => {
const make = (o: Partial<Tweaks> = {}) => createBob(kind, { ...DEFAULTS, ...o });
function bob(world: World, o: Partial<Tweaks> = {}, temp: number | null = null, x = 60): BobModel {
  const b = make(o);
  b.fixedTemp = temp;
  b.spawn(world, x, FLOOR - 12);
  run(b, world, 90);
  return b;
}
/** Hold jump for `hold` steps, release, and return how far his centre rose. */
function jump(b: BobModel, world: World, hold: number): number {
  const y0 = b.main!.cy;
  let top = y0;
  run(b, world, hold, { move: 0, jump: true });
  for (let i = 0; i < 90; i++) { b.step(world, { move: 0, jump: false }); top = Math.min(top, b.main!.cy); }
  return y0 - top;
}
/** Lift him by dy (to drop him from a height). */
const lift = (b: BobModel, dy: number) => b.shift(0, -dy);

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
    const w = ground(M.rock, pool), b = make();
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
    expect(churn(b)).toBeLessThan(60); // rigid: no particle racing round him
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
    const b = make();
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
    const past = (b: BobModel) => b.countIn(106, 0, 320, 200) / b.count;
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
    const b = make();
    b.spawn(w, 60, FLOOR - 12);
    run(b, w, 30);
    let lo = Infinity, hi = -Infinity;
    each(b, (_x, _y, _vx, _vy, t) => { lo = Math.min(lo, t); hi = Math.max(hi, t); });
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
      const w = ground(), b = make();
      b.spawn(w, 60, FLOOR - 12, -20);
      for (let f = 0; f < 180; f++) b.step(w, struggle ? { move: Math.floor(f / 8) % 2 ? 1 : -1, jump: f % 20 < 3 } : { move: 0, jump: false });
      return b.main!.temp;
    };
    const shaken = shake(true), still = shake(false);
    expect(muscleAt(shaken)).toBeGreaterThan(0.3);
    expect(shaken).toBeLessThan(2); // only loosened, not thawed
    expect(muscleAt(still)).toBe(0);
  });

  it("on the course, a round Bob rolls over the pit's lost bit; a runny one pours in for it", () => {
    const attempt = (runny: boolean) => {
      const world = new World(COURSE_W, COURSE_H, 7);
      const course = buildCourse(world), pit = course.marks.pit;
      const b = make();
      if (runny) b.fixedTemp = 80;
      b.spawn(world, runny ? pit + 15 : pit - 40, 195, 20, course.bits);
      for (let f = 0; f < 300; f++) {
        let left = Infinity;
        each(b, (x, _y, _vx, _vy, _t, pi) => { if (pi === 0) left = Math.min(left, x); });
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
    const b = make();
    b.spawn(w, 60, FLOOR - 40, -25);
    for (let f = 0; f < 240; f++) { w.step(); b.step(w, { move: 0, jump: false }); }
    expect(w.count(M.ice)).toBeGreaterThan(50);
  });

  it("boils away on lava", () => {
    const w = ground(M.rock, (w) => { for (let x = 40; x < 90; x++) for (let y = FLOOR - 4; y < FLOOR; y++) w.set(x, y, M.lava); });
    const b = make();
    b.spawn(w, 60, FLOOR - 20);
    run(b, w, 240);
    expect(b.losses.boiled).toBeGreaterThan(b.total * 0.3);
  });
});

describe("tearing", () => {
  it("spikes slice him into a few pieces, not crumbs", () => {
    const w = ground(M.rock, (w) => { for (let x = 30; x < 90; x += 2) for (let y = FLOOR - 3; y < FLOOR; y++) w.set(x, y, M.spike); });
    const b = make();
    b.spawn(w, 60, FLOOR - 40);
    run(b, w, 120);
    expect(b.pieces.length).toBeGreaterThan(1);
    expect(b.main!.len).toBeGreaterThan(b.total * 0.2);
    let fast = 0;
    each(b, (_x, _y, vx, vy) => { fast = Math.max(fast, Math.hypot(vx, vy)); });
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
    const w = ground(M.rock, (w) => spikes(w, M.spike)), b = make();
    b.spawn(w, 60, FLOOR - 50);
    run(b, w, 90);
    expect(b.pieces.length).toBeGreaterThan(1);
    spikes(w, M.air);
    run(b, w, 180);
    const p = b.main!, x0 = p.cx;
    run(b, w, 120, { move: 1, jump: false });
    expect(b.main!.cx - x0).toBeGreaterThan(40);
    // Not stuck flat: about as tall for his size as a fresh Bob.
    const q = b.main!;
    expect(size(b, 0).h).toBeGreaterThan(Math.sqrt(q.len / Math.PI) * 1.4);
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


describe("feel", () => {
  /** A runny Bob pushed out over a ledge until his front is `reach` px past it, then left alone. */
  const dangle = (reach: number) => {
    const w = new World(320, 200, 1);
    for (let y = 120; y < 200; y++) for (let x = 0; x < 100; x++) w.set(x, y, M.rock);
    for (let y = 195; y < 200; y++) for (let x = 0; x < 320; x++) w.set(x, y, M.rock);
    const b = make();
    b.fixedTemp = 62;
    b.spawn(w, 70, 106);
    let go = true;
    for (let f = 0; f < 540; f++) {
      if (size(b, 0).x1 > 100 + reach) go = false;
      b.step(w, { move: go ? 1 : 0, jump: false });
    }
    let top = 0, fell = 0;
    each(b, (_x, y) => { if (y < 120) top++; else if (y > 180) fell++; });
    return { top: top / b.total, fell: fell / b.total };
  };

  it("left alone he settles down: no buzzing or fluttering", () => {
    const w = ground(), b = bob(w);
    run(b, w, 60, { move: 1, jump: false });
    run(b, w, 120);
    let jiggle = 0, n = 0;
    for (let f = 0; f < 60; f++) {
      b.step(w, { move: 0, jump: false });
      each(b, (_x, _y, vx, vy, _t, pi) => { if (pi === 0) { jiggle += Math.hypot(vx - b.main!.vx, vy - b.main!.vy); n++; } });
    }
    expect(jiggle / n).toBeLessThan(2); // px/s, on average
  });

  /** v1 (the lattice) can't do these: kept as a record of what it gets wrong. */
  const v2 = kind === "lattice" ? it.fails : it;

  v2("runny, a little over a ledge he hangs down from it; further, a drop pulls away and the rest stays", () => {
    expect(dangle(-1).fell).toBe(0);
    const hang = dangle(2);
    expect(hang.fell).toBe(0);
    expect(hang.top).toBeLessThan(0.95); // some of him hangs below the lip
    const drip = dangle(4);
    expect(drip.fell).toBeGreaterThan(0.1);
    expect(drip.top).toBeGreaterThan(0.15);
  });

  v2("picking up the pit's lost bit is gentle, and afterwards he sets round again", () => {
    const world = new World(COURSE_W, COURSE_H, 7);
    const course = buildCourse(world), pit = course.marks.pit;
    const b = make();
    b.fixedTemp = 62;
    b.spawn(world, pit + 15, 195, 20, course.bits);
    let worst = 0;
    for (let f = 0; f < 420; f++) {
      let left = Infinity;
      each(b, (x, _y, _vx, _vy, _t, pi) => { if (pi === 0) left = Math.min(left, x); });
      world.step();
      b.step(world, { move: f < 300 && left > pit - 6 ? -0.5 : 0, jump: false, down: f > 90 && f < 300 ? 1 : 0 });
      if (f > 90) worst = Math.max(worst, churn(b));
    }
    expect(b.main!.len).toBe(b.total);
    expect(worst).toBeLessThan(150); // no burst when the bit joins
    // Climb out and cool off: round again, not lumpy or flat.
    b.fixedTemp = 20;
    for (let f = 0; f < 300; f++) { world.step(); b.step(world, { move: f < 120 ? 1 : 0, jump: f > 40 && f < 60 }); }
    const s = size(b, 0);
    expect(s.h).toBeGreaterThan(12); // a fresh Bob of this size rests about 14 tall
    expect(s.w).toBeLessThan(s.h * 1.8); // a dome, not a puddle
  });
});

describe("course", () => {
  it("a scripted run gets most of him to the finish", () => {
    const world = new World(COURSE_W, COURSE_H, 7);
    const course = buildCourse(world);
    const b = make();
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
});
