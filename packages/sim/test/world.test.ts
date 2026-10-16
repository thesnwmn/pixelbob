import { describe, expect, it } from "vitest";
import { M, World, generate } from "../src/index.ts";

/** A box with rock walls and floor, open top. */
function box(w = 40, h = 40, seed = 1): World {
  const world = new World(w, h, seed);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x === 0 || x === w - 1 || y === h - 1) world.set(x, y, M.rock);
  return world;
}
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) w.step(); };
const column = (w: World, x: number, m: number) => { let n = 0; for (let y = 0; y < w.h; y++) if (w.get(x, y) === m) n++; return n; };
const highest = (w: World, m: number) => { for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.get(x, y) === m) return y; return w.h; };
const lowest = (w: World, m: number) => { for (let y = w.h - 1; y >= 0; y--) for (let x = 0; x < w.w; x++) if (w.get(x, y) === m) return y; return -1; };

describe("powders", () => {
  it("sand falls, piles and is conserved", () => {
    const w = box();
    w.paint(20, 5, 3, M.sand);
    const n = w.count(M.sand);
    run(w, 200);
    expect(w.count(M.sand)).toBe(n);
    expect(lowest(w, M.sand)).toBe(38); // resting on the floor
    // A pile, not a single column and not flat.
    expect(column(w, 20, M.sand)).toBeGreaterThan(column(w, 14, M.sand));
    expect(highest(w, M.sand)).toBeGreaterThan(25);
  });
});

describe("liquids", () => {
  it("water levels out across the floor", () => {
    const w = box(60, 30);
    w.paint(10, 10, 4, M.water);
    run(w, 600);
    const xs = [5, 30, 55].map((x) => column(w, x, M.water));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1);
  });

  it("oil floats on water", () => {
    const w = box(30, 40);
    w.paint(15, 8, 4, M.oil);
    run(w, 100);
    w.paint(15, 8, 4, M.water);
    run(w, 800);
    expect(highest(w, M.oil)).toBeLessThan(highest(w, M.water));
    expect(lowest(w, M.water)).toBeGreaterThan(lowest(w, M.oil));
  });
});

describe("drag", () => {
  it("water poured on a light powder doesn't flush it straight to the top", () => {
    const w = box(30, 40);
    for (let x = 1; x < 29; x++) for (let y = 34; y < 39; y++) w.set(x, y, M.snow);
    for (let x = 1; x < 29; x++) for (let y = 20; y < 30; y++) w.set(x, y, M.water);
    run(w, 60);
    // After a second most of the snow is still near the bottom.
    let low = 0;
    for (let x = 1; x < 29; x++) for (let y = 30; y < 39; y++) if (w.get(x, y) === M.snow) low++;
    expect(low).toBeGreaterThan(w.count(M.snow) * 0.7);
  });

  it("ash settles under water", () => {
    const w = box(30, 40);
    for (let x = 1; x < 29; x++) for (let y = 30; y < 39; y++) w.set(x, y, M.water);
    w.paint(15, 5, 3, M.ash);
    run(w, 600);
    expect(lowest(w, M.ash)).toBe(38);
  });
});

describe("heat and reactions", () => {
  it("lava and water make stone and steam", () => {
    const w = box(30, 30);
    for (let x = 1; x < 29; x++) for (let y = 24; y < 29; y++) w.set(x, y, M.lava);
    for (let x = 1; x < 29; x++) for (let y = 16; y < 20; y++) w.set(x, y, M.water);
    run(w, 400);
    expect(w.count(M.stone)).toBeGreaterThan(0);
    expect(w.count(M.steam) + w.count(M.water)).toBeGreaterThan(0);
  });

  it("fire burns wood away", () => {
    const w = box(30, 30);
    for (let x = 8; x < 22; x++) for (let y = 20; y < 29; y++) w.set(x, y, M.wood);
    const wood = w.count(M.wood);
    w.set(15, 19, M.fire);
    w.heat(15, 19, 3, 800);
    run(w, 1500);
    expect(w.count(M.wood)).toBeLessThan(wood * 0.5);
  });

  it("heat melts ice; cold freezes water", () => {
    const a = box(20, 20);
    a.paint(10, 15, 3, M.ice, { replace: true });
    for (let i = 0; i < 300; i++) { a.heat(10, 15, 4, 1); a.step(); }
    expect(a.count(M.water)).toBeGreaterThan(0);

    const b = box(20, 20);
    b.paint(10, 17, 3, M.water);
    run(b, 50);
    for (let i = 0; i < 300; i++) { b.heat(10, 17, 5, -10); b.step(); }
    expect(b.count(M.ice)).toBeGreaterThan(0);
  });

  it("plants drink water and grow", () => {
    const w = box(30, 30);
    for (let x = 5; x < 25; x++) w.set(x, 28, M.dirt);
    for (let x = 5; x < 25; x++) w.set(x, 27, M.plant);
    const before = w.count(M.plant);
    w.paint(15, 20, 3, M.water);
    run(w, 1500);
    expect(w.count(M.plant)).toBeGreaterThan(before + 3);
  });
});

describe("world", () => {
  it("is deterministic", () => {
    const a = new World(160, 90, 9), b = new World(160, 90, 9);
    generate(a, "demo", 4); generate(b, "demo", 4);
    for (const w of [a, b]) { w.paint(80, 10, 6, M.sand); w.paint(40, 20, 4, M.fire); run(w, 120); }
    expect(a.mat).toEqual(b.mat);
    expect(a.temp).toEqual(b.temp);
  });

  it("puts settled chunks to sleep", () => {
    const w = box(128, 64);
    w.paint(30, 10, 4, M.sand);
    run(w, 400);
    expect(w.awakeCount()).toBeLessThan(2);
  });
});
