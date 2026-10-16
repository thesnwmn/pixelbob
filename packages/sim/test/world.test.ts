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

describe("pressure", () => {
  it("water levels out across a U-bend", () => {
    // Two chambers joined by a gap under a dividing wall; fill only the left.
    const w = box(60, 50);
    for (let y = 0; y < 44; y++) for (let x = 28; x < 32; x++) w.set(x, y, M.rock);
    for (let x = 2; x < 27; x++) for (let y = 10; y < 49; y++) w.set(x, y, M.water);
    const level = (x0: number, x1: number) => { for (let y = 0; y < 50; y++) for (let x = x0; x < x1; x++) if (w.get(x, y) === M.water) return y; return 50; };
    const n = w.count(M.water);
    run(w, 3000);
    expect(w.count(M.water)).toBe(n);
    expect(Math.abs(level(1, 28) - level(32, 59))).toBeLessThanOrEqual(2);
  });

  it("a waterfall doesn't pump the pool below up to its source", () => {
    const w = box(60, 50);
    // Upper basin on a ledge with a hole in its floor, pouring into the lower half.
    for (let x = 1; x < 40; x++) w.set(x, 20, M.rock);
    w.set(20, 20, M.air);
    for (let x = 2; x < 39; x++) for (let y = 8; y < 20; y++) w.set(x, y, M.water);
    run(w, 200);
    // While it's still pouring, the lower pool stays below the ledge.
    let top = 50;
    for (let y = 21; y < 50; y++) for (let x = 1; x < 59; x++) if (w.get(x, y) === M.water && w.get(x, y - 1) === M.air && x !== 20) top = Math.min(top, y);
    expect(top).toBeGreaterThan(30);
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

  it("burning wood under water goes out and stays out", () => {
    const w = box(30, 30);
    for (let x = 10; x < 20; x++) for (let y = 20; y < 29; y++) w.set(x, y, M.wood);
    w.heat(15, 19, 4, 800);
    run(w, 60); // catch
    for (let x = 1; x < 29; x++) for (let y = 5; y < 20; y++) if (w.get(x, y) === M.air || w.get(x, y) === M.fire || w.get(x, y) === M.smoke) w.set(x, y, M.water);
    run(w, 400);
    let burning = 0, hot = 0;
    for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === M.wood) { if (w.life[i] > 0) burning++; if (w.temp[i] > 300) hot++; }
    expect(burning).toBe(0);
    expect(hot).toBe(0);
  });

  it("buried wood doesn't catch fire from heat alone", () => {
    const w = box(30, 30);
    for (let x = 1; x < 29; x++) for (let y = 15; y < 29; y++) w.set(x, y, M.rock);
    for (let x = 12; x < 18; x++) for (let y = 20; y < 24; y++) w.set(x, y, M.wood);
    for (let i = 0; i < 100; i++) { w.heat(15, 22, 4, 30); w.step(); }
    let burning = 0;
    for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === M.wood && w.life[i] > 0) burning++;
    expect(burning).toBe(0);
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

describe("mushrooms", () => {
  it("spores on damp dirt underground grow stems and glowing caps", () => {
    const w = box(40, 30);
    w.back.fill(1); // underground
    for (let x = 1; x < 39; x++) for (let y = 26; y < 29; y++) w.set(x, y, M.dirt);
    for (let x = 30; x < 39; x++) w.set(x, 25, M.water);
    for (let x = 5; x < 28; x += 3) w.set(x, 25, M.spore);
    run(w, 1500);
    expect(w.count(M.stem)).toBeGreaterThan(3);
    expect(w.count(M.cap)).toBeGreaterThan(5);
  });

  it("spores with nowhere to grow dry up", () => {
    const w = box(30, 30);
    w.paint(15, 5, 3, M.spore);
    run(w, 1800);
    expect(w.count(M.spore)).toBe(0);
    expect(w.count(M.stem)).toBe(0);
  });
});

describe("explosives and gases", () => {
  it("lit gunpowder blasts a crater and sets off the rest of the pile", () => {
    const w = box(60, 40);
    for (let x = 1; x < 59; x++) for (let y = 20; y < 39; y++) w.set(x, y, M.dirt);
    for (let x = 20; x < 40; x++) for (let y = 17; y < 20; y++) w.set(x, y, M.gunpowder);
    const dirt = w.count(M.dirt);
    run(w, 30); // let the pile settle
    w.heat(30, 18, 3, 400);
    run(w, 300);
    expect(w.count(M.gunpowder)).toBe(0);
    expect(w.count(M.dirt)).toBeLessThan(dirt - 40);
    expect(w.count(M.rubble)).toBeGreaterThan(0);
  });

  it("methane burns away in a flash", () => {
    const w = box(40, 30);
    for (let x = 1; x < 39; x++) for (let y = 5; y < 15; y++) w.set(x, y, M.methane);
    w.set(2, 10, M.fire);
    run(w, 120);
    expect(w.count(M.methane)).toBeLessThan(20);
  });
});

describe("water chemistry", () => {
  it("water soaks dirt into mud, and heat dries it out", () => {
    const w = box(30, 30);
    for (let x = 1; x < 29; x++) for (let y = 24; y < 29; y++) w.set(x, y, M.dirt);
    for (let x = 1; x < 29; x++) for (let y = 20; y < 24; y++) w.set(x, y, M.water);
    run(w, 900);
    expect(w.count(M.mud)).toBeGreaterThan(5);
    for (let i = 0; i < 300; i++) { w.heat(15, 26, 12, 20); w.step(); }
    expect(w.count(M.mud)).toBeLessThan(5);
  });

  it("salt dissolves into brine, which stays liquid when water freezes", () => {
    const w = box(30, 30);
    for (let x = 1; x < 29; x++) for (let y = 22; y < 29; y++) w.set(x, y, M.water);
    w.paint(15, 15, 3, M.salt);
    run(w, 400);
    expect(w.count(M.brine)).toBeGreaterThan(5);
    w.temp.fill(-8);
    w.base.fill(-8);
    w.wakeAll();
    run(w, 600);
    expect(w.count(M.ice)).toBeGreaterThan(0);
    expect(w.count(M.brine)).toBeGreaterThan(5);
  });

  it("boiling brine leaves salt behind", () => {
    const w = box(20, 20);
    for (let x = 1; x < 19; x++) for (let y = 16; y < 19; y++) w.set(x, y, M.brine);
    for (let i = 0; i < 200; i++) { w.heat(10, 17, 10, 30); w.step(); }
    expect(w.count(M.salt)).toBeGreaterThan(5);
  });

  it("wet steel rusts", () => {
    const w = box(30, 30);
    for (let x = 1; x < 29; x++) w.set(x, 28, M.steel);
    for (let x = 1; x < 29; x++) for (let y = 25; y < 28; y++) w.set(x, y, M.water);
    run(w, 1500);
    expect(w.count(M.rust)).toBeGreaterThan(3);
  });
});

describe("vines", () => {
  it("hang down from where they're placed", () => {
    const w = box(30, 40);
    for (let x = 1; x < 29; x++) w.set(x, 2, M.rock);
    w.set(15, 3, M.vine);
    run(w, 1500);
    expect(lowest(w, M.vine)).toBeGreaterThan(10);
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
