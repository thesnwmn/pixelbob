import { M } from "@pixelbob/sim";
import { Buf, Kind } from "../../kit/buf.ts";
import { hex, mix, scale, type RGB } from "../../kit/color.ts";
import { flame, motes, plume } from "../../kit/fx.ts";
import { drawGoo, poseFrames } from "../../kit/goo.ts";
import type { PointLight } from "../../kit/light.ts";
import { MAT, paint, type Material } from "../../kit/materials.ts";
import { disc, each, line, rect } from "../../kit/paint.ts";
import { fbm, hash1, hash2, noise2 } from "../../kit/rng.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;
const FLOOR = 132;
/** The floor slab is this thick; under it, the furnace basement. */
const SLAB = 7;
/** The gate: a steel slab hanging from the ceiling, held up a crack by the plate. */
const GATE_X = 148, GATE_W = 12, GAP = 6;
/** Where the main Bob was heated: a floor vent. */
const VENT_X0 = 114, VENT_X1 = 144;
/** The pressure plate his left-behind piece sits on. */
const PLATE_X0 = 26, PLATE_X1 = 50;
/** Molten vat under the grating, and the pour into it. */
const VAT_X0 = 178, VAT_X1 = 284, VAT_Y = 158, POUR_X = 236;
const COOL = hex("#cfe0ff"), HOTC = hex("#ff7a28"), GO = hex("#5cff9a");
const HAZ_Y = hex("#e8b030"), HAZ_K = hex("#1e1a16");
const STEAM = ["#9aa6b0", "#c3ccd4", "#e3e9ee"].map(hex);

/** A bevelled plate: light top/left edge, dark bottom/right, rivets in the corners. */
function plate(buf: Buf, x0: number, y0: number, w: number, h: number, mat: Material, kind: number, seed: number, shade = 0.5): void {
  rect(x0, y0, w, h, (x, y) => {
    const top = y === y0, left = x === x0, bot = y === y0 + h - 1, right = x === x0 + w - 1;
    const s = top || left ? shade + 0.4 : bot || right ? shade - 0.4 : shade + (fbm(x * 0.1, y * 0.1, seed) - 0.5) * 0.3;
    paint(buf, x, y, mat, s, seed);
    if (kind !== Kind.Solid) { buf.kind[buf.idx(x, y)] = kind; buf.occ[buf.idx(x, y)] = kind === Kind.Back ? 0 : 0.6; }
  });
  if (w > 6 && h > 6)
    for (const [rx, ry] of [[x0 + 2, y0 + 2], [x0 + w - 3, y0 + 2], [x0 + 2, y0 + h - 3], [x0 + w - 3, y0 + h - 3]]) {
      if (!buf.inside(rx + 1, ry + 1)) continue;
      const c = buf.get(rx, ry);
      buf.alb.set(mix(c, [1, 1, 1], 0.35), buf.idx(rx, ry) * 3);
      buf.alb.set(scale(c, 0.6), buf.idx(rx + 1, ry + 1) * 3);
    }
}

function hazard(buf: Buf, x0: number, y0: number, w: number, h: number, kind: Kind = Kind.Solid): void {
  rect(x0, y0, w, h, (x, y) => buf.set(x, y, ((x + y) >> 2) % 2 ? HAZ_Y : HAZ_K, kind, kind === Kind.Solid ? 0.7 : 0));
}

/** Horizontal pipe with cylinder shading. */
function pipe(buf: Buf, x0: number, x1: number, y: number, r: number, base: RGB): void {
  for (let x = x0; x <= x1; x++)
    for (let k = -r; k <= r; k++) {
      const f = k / r;
      const c = f < -0.5 ? mix(base, [1, 1, 1], 0.3) : f > 0.5 ? scale(base, 0.5) : f > 0 ? scale(base, 0.8) : base;
      buf.set(x, y + k, x % 40 < 2 ? scale(c, 0.7) : c, Kind.Back, 0);
    }
}

export const foundry: SceneDef = {
  id: "foundry",
  title: "The Foundry",
  blurb: "A piece of Bob holds the plate down; the rest melted on the vent, poured under the gate, and is pulling himself round again.",
  notes: [
    "The puzzle: the gate only lifts a crack while the plate is weighed down, and round Bob doesn't fit under it. Split, leave a piece on the plate, sit on the vent until your underside runs, pour under, then work out how to bring the piece along.",
    "Cause and effect are lit: the plate's strip and the signal line glow green all the way to the gate's lamp.",
    "Two-colour light: blue work lamps over the plate and the gate, orange from the vent, the vat and the pour; the exit is the coolest, calmest thing on screen.",
    "Bob is the real goo, posed by simulation: heat from below makes his underside run while his top holds, and past the gate he cools and rounds up. His runny tail goes molten-orange, the danger colour.",
  ],
  w: W,
  h: H,
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    const sim = new Uint8Array(W * H);

    // Back wall: dim riveted panels, a band of brick low down, grime.
    each(buf, (x, y) => buf.set(x, y, [0, 0, 0], Kind.Back, 0));
    for (let py = 10; py < FLOOR; py += 20)
      for (let px = -((py / 10) % 4) * 7; px < W; px += 28) {
        const rusty = hash2(px, py, seed) < 0.22;
        plate(buf, px, py, 28, 20, rusty ? MAT.rust : MAT.metal, Kind.Back, seed, 0.22);
      }
    const BRICK_Y = 104;
    rect(0, BRICK_Y, W, FLOOR - BRICK_Y, (x, y) => {
      const row = (y - BRICK_Y) >> 2, off = row % 2 ? 4 : 0;
      const mortar = (y - BRICK_Y) % 4 === 3 || (x + off) % 8 === 7;
      paint(buf, x, y, MAT.brick, mortar ? 0.0 : 0.45, seed);
      buf.kind[buf.idx(x, y)] = Kind.Back;
    });
    each(buf, (x, y) => {
      if (buf.kindAt(x, y) !== Kind.Back) return;
      const g = fbm(x * 0.06, y * 0.025, seed + 3);
      if (g > 0.55) buf.blend(x, y, hex("#0c0a09"), Math.min(0.8, (g - 0.55) * 2));
    });
    pipe(buf, 0, W, 56, 4, hex("#3e4650"));
    pipe(buf, 0, W, 67, 2, hex("#5a3e2a"));

    // Ceiling girder.
    rect(0, 0, W, 10, (x, y) => paint(buf, x, y, MAT.steel, y < 2 || y > 7 ? 0.8 : y === 8 ? 0.1 : 0.35, seed));
    for (let x = 0; x < W; x += 16) line(x, 2, x + 8, 7, (lx, ly) => paint(buf, lx, ly, MAT.steel, 0.8, seed));

    // Floor slab on the left, up to the vat. Under it, the furnace basement.
    for (let x = 0; x < VAT_X0 - 2; x += 32) plate(buf, x, FLOOR, Math.min(32, VAT_X0 - 2 - x), SLAB, MAT.steel, Kind.Solid, seed + x, 0.45);
    rect(0, FLOOR + SLAB, VAT_X0 - 2, H - FLOOR - SLAB, (x, y) => {
      const n = fbm(x * 0.05, y * 0.08, seed + 9);
      buf.set(x, y, mix(hex("#0e0b0a"), hex("#221816"), n), Kind.Back, 0);
    });
    // Girders holding the floor up.
    for (const gx of [8, 58, 140]) {
      rect(gx, FLOOR + SLAB, 4, H - FLOOR - SLAB, (x, y) => paint(buf, x, y, MAT.metal, x === gx ? 0.6 : 0.25, seed));
      line(gx + 4, FLOOR + SLAB + 2, gx + 26, H - 2, (x, y) => paint(buf, x, y, MAT.metal, 0.3, seed));
    }
    // The furnace: a brick firebox under the vent, its mouth roaring.
    const FX0 = VENT_X0 - 8, FX1 = VENT_X1 + 8, FY = FLOOR + SLAB;
    rect(FX0, FY, FX1 - FX0, H - FY, (x, y) => {
      const row = (y - FY) >> 2, off = row % 2 ? 4 : 0;
      paint(buf, x, y, MAT.brick, (y - FY) % 4 === 3 || (x + off) % 8 === 7 ? 0.05 : 0.6, seed);
      buf.kind[buf.idx(x, y)] = Kind.Back;
    });
    rect(VENT_X0, FY, VENT_X1 - VENT_X0, H - FY - 10, (x, y) => {
      const k = 1 - (y - FY) / (H - FY - 10);
      buf.set(x, y, mix(hex("#2a0804"), hex("#e07020"), k * k), Kind.Back, 0);
      buf.glow(x, y, mix(hex("#600c04"), hex("#ff7a20"), k), 0.2 + k * 0.4);
    });
    // The vent: a grate in the slab, the fire below showing through.
    rect(VENT_X0, FLOOR, VENT_X1 - VENT_X0, SLAB, (x, y) => {
      sim[y * W + x] = M.steel;
      if (y === FLOOR || (x - VENT_X0) % 4 === 0) paint(buf, x, y, MAT.steel, y === FLOOR ? 0.85 : 0.2, seed);
      else { buf.set(x, y, hex("#ffb040"), Kind.Back, 0); buf.glow(x, y, hex("#ff8a2a"), 0.9); }
    });
    hazard(buf, VENT_X0 - 6, FLOOR, 6, 2);
    // The pressure plate: pressed down into the floor, its strip lit green.
    rect(PLATE_X0, FLOOR, PLATE_X1 - PLATE_X0, 2, (x, y) => paint(buf, x, y, MAT.steel, y === FLOOR ? 0.95 : 0.3, seed));
    hazard(buf, PLATE_X0 - 5, FLOOR, 5, 2);
    hazard(buf, PLATE_X1, FLOOR, 5, 2);
    rect(PLATE_X0 + 1, FLOOR + 2, PLATE_X1 - PLATE_X0 - 2, 1, (x, y) => { buf.set(x, y, GO, Kind.Solid, 0.6); buf.glow(x, y, GO, 1.2); });

    // A signal line from the plate, up the wall and along to the gate: lit green while the
    // plate is down, so cause and effect read at a glance.
    const RUN_Y = 22, CX = PLATE_X0 - 8, GMID = GATE_X + GATE_W / 2;
    const route: [number, number][] = [];
    for (let x = PLATE_X0 - 1; x > CX; x--) route.push([x, FLOOR - 2]);
    for (let y = FLOOR - 2; y > RUN_Y; y--) route.push([CX, y]);
    for (let x = CX; x < GMID; x++) route.push([x, RUN_Y]);
    for (let y = RUN_Y; y < 24; y++) route.push([GMID, y]);
    for (const [x, y] of route) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) buf.set(x + dx, y + dy, hex("#1c2422"), Kind.Back, 0);
      buf.set(x, y, hex("#2a8a5a"), Kind.Back, 0);
      buf.glow(x, y, GO, 0.25);
    }
    for (let k = 0; k < route.length; k += 24) {
      const [x, y] = route[k];
      rect(x - 1, y - 1, 4, 4, (lx, ly) => buf.set(lx, ly, hex("#3a4048"), Kind.Back, 0));
    }

    // The gate: a heavy slab in rails, lifted just a crack.
    rect(GATE_X - 4, 10, GATE_W + 8, 10, (x, y) => { paint(buf, x, y, MAT.metal, y === 10 ? 0.8 : y === 19 ? 0.1 : 0.45, seed); sim[y * W + x] = M.steel; });
    rect(GATE_X - 2, 20, 2, FLOOR - 20, (x, y) => paint(buf, x, y, MAT.steel, 0.25, seed));
    rect(GATE_X + GATE_W, 20, 2, FLOOR - 20, (x, y) => paint(buf, x, y, MAT.steel, 0.25, seed));
    for (let x = GATE_X - 2; x < GATE_X + GATE_W + 2; x++) for (let y = 20; y < FLOOR; y++) if (x < GATE_X || x >= GATE_X + GATE_W) { buf.kind[buf.idx(x, y)] = Kind.Back; buf.occ[buf.idx(x, y)] = 0; }
    // Drawn as an object so the lamp lights its whole face (solid rock fades inward; a door shouldn't).
    plate(buf, GATE_X, 20, GATE_W, FLOOR - GAP - 20, MAT.steel, Kind.Object, seed + 5, 0.5);
    rect(GATE_X, 20, GATE_W, FLOOR - GAP - 20, (x, y) => { sim[y * W + x] = M.steel; buf.occ[buf.idx(x, y)] = 0.15; });
    // Cross-braced panels, so it reads as a door and not a pillar.
    for (let y = 22; y + 14 < FLOOR - GAP - 5; y += 16) {
      rect(GATE_X + 1, y, GATE_W - 2, 1, (x, yy) => paint(buf, x, yy, MAT.steel, 0.1, seed));
      line(GATE_X + 1, y + 1, GATE_X + GATE_W - 2, y + 15, (x, yy) => paint(buf, x, yy, MAT.steel, 0.85, seed));
    }
    hazard(buf, GATE_X, FLOOR - GAP - 5, GATE_W, 5, Kind.Object);
    // A green lamp beside it: the plate is down, the gate is up.
    rect(GATE_X - 9, 78, 5, 6, (x, y) => buf.set(x, y, hex("#16191c"), Kind.Back, 0));
    rect(GATE_X - 8, 79, 3, 2, (x, y) => { buf.set(x, y, GO, Kind.Back, 0); buf.glow(x, y, GO, 1.8); });
    rect(GATE_X - 8, 82, 3, 1, (x, y) => buf.set(x, y, hex("#401010"), Kind.Back, 0));

    // Past the gate: a grating catwalk over the molten vat.
    rect(VAT_X0, FLOOR, VAT_X1 - VAT_X0, H - FLOOR, (x, y) => {
      const k = Math.max(0, Math.min(1, (y - FLOOR) / (VAT_Y - FLOOR)));
      buf.set(x, y, mix(hex("#140806"), hex("#5a1a08"), k * k), Kind.Back, 0);
    });
    // Molten metal under a drifting crust: dark plates, bright seams.
    for (let x = VAT_X0; x < VAT_X1; x++)
      for (let y = VAT_Y; y < H; y++) {
        const top = y === VAT_Y;
        const c = fbm(x * 0.09, y * 0.2, seed + 12, 3), seam = Math.abs(c - 0.5) < 0.04;
        if (!top && c > 0.5 && !seam) {
          buf.set(x, y, mix(hex("#3a1206"), hex("#7a2408"), (c - 0.5) * 2), Kind.Fluid, 0.3);
          buf.glow(x, y, hex("#a02a08"), 0.25);
        } else paint(buf, x, y, MAT.molten, top || seam ? 0.95 : 0.5 - (y - VAT_Y) * 0.02, seed, top || seam ? 1.2 : 0.6);
      }
    rect(VAT_X0 - 2, FLOOR, 2, H - FLOOR, (x, y) => paint(buf, x, y, MAT.steel, 0.3, seed));
    rect(VAT_X1, FLOOR, 2, H - FLOOR, (x, y) => paint(buf, x, y, MAT.steel, 0.3, seed));
    for (let x = VAT_X0; x < VAT_X1; x++) {
      paint(buf, x, FLOOR, MAT.steel, 0.85, seed);
      sim[FLOOR * W + x] = M.steel;
      for (let y = FLOOR + 1; y < FLOOR + 3; y++) {
        sim[y * W + x] = M.steel;
        if ((x - VAT_X0) % 3 === 0) paint(buf, x, y, MAT.steel, 0.3, seed);
        else { buf.set(x, y, hex("#ff8a30"), Kind.Back, 0); buf.glow(x, y, hex("#ff7020"), 0.45); }
      }
    }
    for (let x = VAT_X0 + 12; x < VAT_X1; x += 26) rect(x, FLOOR + 3, 2, VAT_Y - FLOOR - 3, (lx, ly) => paint(buf, lx, ly, MAT.metal, 0.35, seed));
    // Right: the exit, a doorway full of cool night air.
    plate(buf, VAT_X1 + 2, FLOOR, W - VAT_X1 - 2, H - FLOOR, MAT.steel, Kind.Solid, seed + 7, 0.45);
    const DX = 296, DY = 80;
    rect(DX - 5, DY, W - DX + 5, FLOOR - DY, (x, y) => {
      if (x < DX) { paint(buf, x, y, MAT.steel, x === DX - 5 ? 0.8 : 0.3, seed); buf.kind[buf.idx(x, y)] = Kind.Back; }
      else {
        const k = (y - DY) / (FLOOR - DY);
        buf.set(x, y, mix(hex("#8aaee0"), hex("#24365a"), k), Kind.Back, 0);
        buf.glow(x, y, mix(hex("#5070a8"), hex("#14223c"), k), 0.45);
      }
    });
    rect(DX - 5, DY - 4, W - DX + 5, 4, (x, y) => paint(buf, x, y, MAT.steel, y === DY - 4 ? 0.9 : 0.4, seed));
    hazard(buf, DX - 5, DY - 8, W - DX + 5, 4, Kind.Back);

    // The crucible, hanging from chains, tipping its pour into the vat.
    const CHAIN = hex("#6f757c");
    const CR_Y = 26;
    for (let y = 10; y < CR_Y; y += 2) { buf.set(POUR_X - 18 + (y % 4 ? 1 : 0), y, CHAIN, Kind.Object, 0.3); buf.set(POUR_X + 6 + (y % 4 ? 0 : 1), y, CHAIN, Kind.Object, 0.3); }
    for (let k = 0; k < 16; k++) {
      const y = CR_Y + k, x0 = POUR_X - 22 + Math.round(k * 0.25), x1 = POUR_X + 10 - Math.round(k * 0.35);
      for (let x = x0; x <= x1; x++) paint(buf, x, y, MAT.rust, x === x0 || k === 15 ? 0.15 : x === x1 ? 0.2 : 0.55, seed);
    }
    for (let x = POUR_X - 21; x < POUR_X + 10; x++) paint(buf, x, CR_Y, MAT.molten, 0.9, seed, 1.4);
    hazard(buf, POUR_X - 18, CR_Y + 6, 22, 3);

    // Hanging work lamps: one over the plate, one over the gate.
    const lamp = (x: number, len: number) => {
      for (let y = 10; y < 10 + len; y++) buf.set(x, y, CHAIN, Kind.Object, 0);
      rect(x - 4, 10 + len, 9, 3, (lx, ly) => buf.set(lx, ly, hex("#3a4048"), Kind.Object, 0));
      rect(x - 3, 13 + len, 7, 1, (lx, ly) => { buf.set(lx, ly, COOL, Kind.Object, 0); buf.glow(lx, ly, COOL, 1.8); });
    };
    lamp(PLATE_X0 + 12, 52); lamp(GATE_X - 18, 44);

    // Foreground: a crane hook on a chain, in silhouette, for depth.
    const HOOK_X = 84, HOOK_Y = 58, DARK = hex("#08090b");
    for (let y = 10; y < HOOK_Y; y++) { buf.set(HOOK_X + (y % 4 < 2 ? 0 : 1), y, DARK, Kind.Object, 0); if (y % 4 === 0) buf.set(HOOK_X - 1, y, DARK, Kind.Object, 0); }
    rect(HOOK_X - 3, HOOK_Y, 8, 5, (x, y) => buf.set(x, y, DARK, Kind.Object, 0));
    for (let a = 0; a < 26; a++) {
      const ang = Math.PI * (0.05 + a / 26 * 1.1), r = 5;
      const x = HOOK_X + 1 + Math.cos(ang) * r, y = HOOK_Y + 10 + Math.sin(ang) * r;
      buf.set(x, y, DARK, Kind.Object, 0); buf.set(x + 1, y, DARK, Kind.Object, 0);
    }
    rect(HOOK_X, HOOK_Y + 5, 2, 5, (x, y) => buf.set(x, y, DARK, Kind.Object, 0));

    // What Bob meets: steel for every solid pixel unless marked otherwise.
    for (let i = 0; i < W * H; i++) if (!sim[i]) sim[i] = buf.kind[i] === Kind.Solid ? M.steel : M.air;

    // Bob: runny from the vent, pouring under the gate. A piece of him stayed on the plate.
    const plateMid = (PLATE_X0 + PLATE_X1) / 2;
    // Bob's coordinates in the pose are relative to its region, whose floor is this far down.
    const REGION_FLOOR = 50;
    const at = 140, hot = 60, WARM_AT = 30, TOP = 40, COOLED = 28;
    const [bob] = poseFrames(buf, {
      x: 128, y: FLOOR - 12, temp: hot, region: [10, FLOOR - REGION_FLOOR, 200, 60],
      bits: [{ x: plateMid, y: FLOOR - 7, r: 5.6 }],
      mat: (x, y) => sim[y * W + x],
      input: (f) => ({ move: f > 10 ? 1 : 0, jump: false }),
      // Hold each piece at its own temperature: the one on the plate cool, the rest hot.
      each: (_f, b) => {
        b.fixedTemp = null;
        const v = b.view();
        // He sat on the vent by the gate until his underside ran; the runny part pours
        // under the gate, and once past it (away from the heat) he cools and rounds up again.
        const k = Math.min(1, Math.max(0, (_f - WARM_AT) / 20));
        const gx = GATE_X - 10; // the gate, in region coordinates
        for (let i = 0; i < v.x.length; i++) {
          const up = Math.min(1, Math.max(0, (REGION_FLOOR - v.y[i]) / 16)); // 0 at the floor, 1 up top
          const past = Math.min(1, Math.max(0, (v.x[i] - gx - GATE_W) / 10));
          const heated = 20 + k * (hot - 20 - up * (hot - TOP));
          v.t[i] = v.x[i] < 60 ? 20 : heated + (COOLED - heated) * past;
        }
      },
      seed: 3,
    }, [at]);

    const lights: PointLight[] = [
      { x: CX + 6, y: 70, color: GO, radius: 40, intensity: 0.25 },
      { x: PLATE_X0 + 12, y: 68, color: COOL, radius: 90, intensity: 1.4 },
      { x: GATE_X - 18, y: 60, color: COOL, radius: 95, intensity: 1.3 },
      { x: 108, y: FLOOR + 4, color: HOTC, radius: 80, intensity: 1.7, flicker: 0.4 },
      { x: 108, y: H - 6, color: HOTC, radius: 60, intensity: 1.4, flicker: 0.5 },
      { x: 232, y: VAT_Y - 4, color: HOTC, radius: 130, intensity: 1.7, flicker: 0.3 },
      { x: POUR_X - 6, y: 60, color: HOTC, radius: 70, intensity: 0.8, flicker: 0.2 },
      { x: plateMid, y: FLOOR - 2, color: GO, radius: 24, intensity: 0.4 },
      { x: 306, y: 110, color: hex("#9ab8ff"), radius: 60, intensity: 0.8 },
    ];


    return {
      buf,
      lights,
      ambient: [0.08, 0.08, 0.11],
      depth: { fade: 22, min: 0.3 },
      backLit: 0.65,
      grade: { tint: [1.04, 0.98, 0.95], vignette: 0.4, bloom: 0.9, threshold: 0.75 },
      frame(b, t) {
        // The pour: a wobbling column of molten pixels from the crucible lip into the vat.
        for (let y = CR_Y + 10; y < VAT_Y; y++) {
          const wob = Math.round(Math.sin(y * 0.15 - t * 12) * 0.7 + (noise2(y * 0.2, t * 4, seed) - 0.5) * 1.2);
          const cx = POUR_X - 2 + Math.max(0, CR_Y + 18 - y) * 0.5 + wob;
          if (y >= FLOOR && y < FLOOR + 3 && (cx - VAT_X0) % 3 === 0) continue;
          for (let k = -1; k <= 0; k++) {
            const c = k === 0 ? MAT.molten.ramp[3] : MAT.molten.ramp[1];
            if (b.solidAt(cx + k, y) && y < FLOOR) continue;
            b.set(cx + k, y, c, Kind.Fluid, 0.1);
            b.glow(cx + k, y, c, 1.3);
          }
        }
        // Splash sparks where it lands.
        for (let i = 0; i < 18; i++) {
          const life = 0.5 + hash1(i, seed) * 0.5, age = (t + hash1(i, seed + 1) * life) % life;
          const vx = (hash1(i, seed + 2) - 0.5) * 90, vy = -40 - hash1(i, seed + 3) * 60;
          const x = POUR_X - 2 + vx * age, y = VAT_Y + vy * age + 160 * age * age;
          if (y > VAT_Y) continue;
          const c = age / life < 0.5 ? hex("#fff0a0") : HOTC;
          b.set(x, y, c, Kind.Object, 0); b.glow(x, y, c, 1.3 * (1 - age / life));
        }
        // The vat's surface crawls.
        for (let x = VAT_X0; x < VAT_X1; x++) {
          const n = noise2(x * 0.12 - t * 0.8, t * 0.5, seed + 2);
          if (n > 0.64) { b.set(x, VAT_Y, hex("#fff2b0"), Kind.Fluid, 0.1); b.glow(x, VAT_Y, hex("#ffd070"), 0.8); }
        }
        // Heat shimmer and embers rising off the vent, steam leaking from the gate housing.
        motes(b, 10, t, seed + 5, [VENT_X0, FLOOR - 40, VENT_X1 - VENT_X0, 40], hex("#ffb060"), 1, 12);
        motes(b, 14, t, seed + 6, [VAT_X0, 70, VAT_X1 - VAT_X0, VAT_Y - 72], hex("#ffa050"), 1, 9);
        plume(b, VENT_X0 + 10, FLOOR - 2, 40, t * 0.9, seed + 4, ["#3a3634", "#5a5250"].map(hex), 0.18, 0.4, 9);
        plume(b, GATE_X + GATE_W + 5, 16, 30, t, seed + 8, STEAM, 0.3, 0.7, 10);
        // Signal pulses running from the plate to the gate.
        for (let p = 0; p < 4; p++) {
          const at = Math.floor(((t * 0.35 + p / 4) % 1) * route.length);
          for (let k = 0; k < 4; k++) {
            const [x, y] = route[Math.max(0, at - k)];
            b.set(x, y, mix(GO, [1, 1, 1], 0.3 * (1 - k / 4)), Kind.Back, 0);
            b.glow(x, y, GO, 1.4 * (1 - k / 4));
          }
        }
        // Bob: both pieces. The one on the plate is cool; the main one is molten from the vent.
        drawGoo(b, bob, { palette, t, selfLit: 1.8 });
        flame(b, (VENT_X0 + VENT_X1) / 2, H - 9, 11, 13, t, seed + 1, 0.8);
        // Little embers in the steam out of the vat; the exit's cool air drifting in.
        motes(b, 8, t, seed + 9, [DX + 2, DY + 4, W - DX - 2, FLOOR - DY - 6], hex("#cfe0ff"), 0.4, 3);
      },
    };
  },
};
