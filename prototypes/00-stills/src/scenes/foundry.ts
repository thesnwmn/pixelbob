import { Buf, Kind } from "../kit/buf.ts";
import { drawBob, type Lobe } from "../kit/bob.ts";
import { hex, mix, scale, type RGB } from "../kit/color.ts";
import { flame, motes, plume } from "../kit/fx.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint, type Material } from "../kit/materials.ts";
import { disc, each, line, rect, stroke } from "../kit/paint.ts";
import { fbm, hash1, hash2, noise2 } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270;
const FLOOR = 238;
const COOL = hex("#dfe9ff"), HOTC = hex("#ff7a28");
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
      const c = buf.get(rx, ry);
      buf.alb.set(mix(c, [1, 1, 1], 0.35), buf.idx(rx, ry) * 3);
      buf.alb.set(scale(c, 0.6), buf.idx(rx + 1, ry + 1) * 3);
    }
}

function hazard(buf: Buf, x0: number, y0: number, w: number, h: number): void {
  rect(x0, y0, w, h, (x, y) => buf.set(x, y, ((x + y) >> 2) % 2 ? HAZ_Y : HAZ_K, Kind.Solid, 0.7));
}

/** Horizontal pipe with cylinder shading. */
function pipe(buf: Buf, x0: number, x1: number, y: number, r: number, base: RGB, kind: number): void {
  for (let x = x0; x <= x1; x++)
    for (let k = -r; k <= r; k++) {
      const f = k / r; // -1 top .. 1 bottom
      const c = f < -0.5 ? mix(base, [1, 1, 1], 0.3) : f > 0.5 ? scale(base, 0.5) : f > 0 ? scale(base, 0.8) : base;
      buf.set(x, y + k, x % 40 < 2 ? scale(c, 0.7) : c, kind as Kind, kind === Kind.Back ? 0 : 0.7);
    }
}

export const foundry: SceneDef = {
  id: "foundry",
  title: "Foundry",
  blurb: "Hard angles, steel and rivets. Molten metal pours, steam leaks, Bob gets runny.",
  notes: [
    "Industrial spaces trade organic noise for straight edges, bevels and repeating panels.",
    "Heat is a material property: Bob near the pour turns orange, loses stiffness and starts to puddle and drip.",
    "Cool ceiling lamps vs the orange pour gives every industrial screen a two-colour light story.",
    "Steam is a light gas (rises, condenses back to water on cold metal); sparks are short-lived fire cells.",
  ],
  w: W,
  h: H,
  focus: [0.42, 0.66],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    // Back wall: riveted panels, with a band of brick low down and grime.
    each(buf, (x, y) => buf.set(x, y, [0, 0, 0], Kind.Back, 0));
    for (let py = 14; py < FLOOR; py += 24)
      for (let px = -((py / 24) % 2) * 16; px < W; px += 32) {
        const rusty = hash2(px, py, seed) < 0.25;
        plate(buf, px, py, 32, 24, rusty ? MAT.rust : MAT.metal, Kind.Back, seed, 0.35);
      }
    rect(0, 196, W, FLOOR - 196, (x, y) => {
      const row = (y - 196) >> 2, off = row % 2 ? 4 : 0;
      const mortar = (y - 196) % 4 === 3 || (x + off) % 8 === 7;
      paint(buf, x, y, MAT.brick, mortar ? 0.0 : 0.5, seed);
      buf.kind[buf.idx(x, y)] = Kind.Back;
    });
    each(buf, (x, y) => {
      if (buf.kindAt(x, y) !== Kind.Back) return;
      const g = fbm(x * 0.05, y * 0.02, seed + 3);
      if (g > 0.6) buf.blend(x, y, hex("#120e0c"), (g - 0.6) * 1.6);
    });
    // A big flywheel on the wall.
    disc(118, 72, 30, (x, y) => {
      const d = Math.hypot(x - 118, y - 72), a = Math.atan2(y - 72, x - 118);
      const tooth = d > 26 && Math.sin(a * 14) > 0;
      const spoke = d < 24 && d > 6 && Math.abs(Math.sin(a * 3)) < 0.12;
      if (d <= 26 && d > 22 || tooth || spoke || d < 6) {
        paint(buf, x, y, MAT.steel, 0.3 + (y < 72 ? 0.25 : 0) + (d < 3 ? 0.3 : 0), seed);
        buf.kind[buf.idx(x, y)] = Kind.Back;
        buf.occ[buf.idx(x, y)] = 0;
      }
    });
    // Big background pipes.
    pipe(buf, 0, W, 112, 5, hex("#4b5560"), Kind.Back);
    pipe(buf, 0, W, 128, 3, hex("#6b4a32"), Kind.Back);

    // Ceiling girder and floor.
    rect(0, 0, W, 14, (x, y) => paint(buf, x, y, MAT.steel, y < 2 || y > 11 ? 0.8 : y === 12 ? 0.1 : 0.35, seed));
    for (let x = 0; x < W; x += 20) line(x, 3, x + 10, 10, (lx, ly) => paint(buf, lx, ly, MAT.steel, 0.8, seed));
    for (let x = 0; x < W; x += 40) plate(buf, x, FLOOR, 40, H - FLOOR, MAT.steel, Kind.Solid, seed + x, 0.45);
    // Trough for the molten pour.
    rect(206, FLOOR, 92, 12, (x, y) => buf.set(x, y, [0, 0, 0], Kind.Back, 0));
    rect(204, FLOOR, 2, 14, (x, y) => paint(buf, x, y, MAT.steel, 0.2, seed));
    rect(298, FLOOR, 2, 14, (x, y) => paint(buf, x, y, MAT.steel, 0.2, seed));
    rect(204, FLOOR + 12, 96, 2, (x, y) => paint(buf, x, y, MAT.steel, 0.2, seed));
    for (let x = 206; x < 298; x++) for (let y = FLOOR + 2; y < FLOOR + 12; y++) paint(buf, x, y, MAT.molten, 0.4 + (y === FLOOR + 2 ? 0.5 : 0), seed, y === FLOOR + 2 ? 1.2 : 0.6);
    hazard(buf, 180, FLOOR, 24, 3);
    hazard(buf, 300, FLOOR, 24, 3);

    // Catwalk (left) with struts and railing.
    plate(buf, 0, 150, 176, 5, MAT.steel, Kind.Solid, seed, 0.5);
    hazard(buf, 168, 150, 8, 2);
    for (let x = 12; x < 170; x += 46) {
      stroke(x, 155, x + 22, 196, 1, (lx, ly) => paint(buf, lx, ly, MAT.metal, 0.6, seed));
      buf.set(x, 155, [1, 1, 1], Kind.Solid, 0.7);
    }
    const RAIL = hex("#c8a040");
    for (let x = 2; x < 172; x++) { buf.set(x, 138, RAIL, Kind.Object, 0.2); buf.set(x, 139, scale(RAIL, 0.5), Kind.Object, 0.2); }
    for (let x = 4; x < 172; x += 14) for (let y = 140; y < 150; y++) buf.set(x, y, scale(RAIL, 0.7), Kind.Object, 0.2);
    // Control box on the catwalk.
    plate(buf, 28, 118, 30, 32, MAT.metal, Kind.Object, seed + 1, 0.55);
    rect(32, 122, 22, 12, (x, y) => buf.set(x, y, hex("#062018"), Kind.Object, 0.6));

    // Right platform with a conveyor and crates.
    plate(buf, 330, 176, 150, 6, MAT.steel, Kind.Solid, seed + 2, 0.5);
    for (let x = 334; x < W; x += 9) disc(x, 173, 2, (lx, ly) => buf.set(lx, ly, mix(hex("#2a2e34"), hex("#8a939e"), (ly - 171) / 4 < 0.4 ? 1 : 0.2), Kind.Solid, 0.7));
    for (let x = 332; x < W; x++) buf.set(x, 170, hex("#1b1d21"), Kind.Solid, 0.7);
    plate(buf, 372, 152, 18, 18, MAT.wood, Kind.Solid, seed + 3, 0.55);
    plate(buf, 392, 158, 12, 12, MAT.wood, Kind.Solid, seed + 4, 0.5);
    for (let y = 182; y < FLOOR; y += 1) { paint(buf, 336, y, MAT.metal, 0.6, seed); paint(buf, 337, y, MAT.metal, 0.3, seed); paint(buf, 470, y, MAT.metal, 0.6, seed); }
    // Vertical pipe with a valve, leaking steam.
    for (let y = 14; y < 176; y++) for (let k = -3; k <= 3; k++) buf.set(440 + k, y, k < -1 ? hex("#8a939e") : k > 1 ? hex("#2e3338") : hex("#5a636c"), Kind.Solid, 0.7);
    disc(440, 92, 5, (x, y) => { const d = Math.hypot(x - 440, y - 92); if (d > 3.5 || d < 1.2) buf.set(x, y, hex("#b82a1e"), Kind.Object, 0.3); });

    // Crucible hanging from chains, tipped toward the trough.
    const CHAIN = hex("#6f757c");
    for (let y = 14; y < 64; y += 2) { buf.set(236 + (y % 4 ? 1 : 0), y, CHAIN, Kind.Object, 0.3); buf.set(268 + (y % 4 ? 0 : 1), y, CHAIN, Kind.Object, 0.3); }
    for (let k = 0; k < 26; k++) {
      const y = 64 + k, x0 = 232 + Math.round(k * 0.2), x1 = 274 - Math.round(k * 0.35);
      for (let x = x0; x <= x1; x++) paint(buf, x, y, MAT.rust, x === x0 || k === 25 ? 0.15 : x === x1 ? 0.2 : 0.55, seed);
    }
    for (let x = 233; x < 274; x++) paint(buf, x, 64, MAT.molten, 0.9, seed, 1.4);
    hazard(buf, 236, 72, 30, 3);

    // Furnace under the right platform, mouth glowing.
    rect(352, 188, 76, 50, (x, y) => {
      const row = (y - 188) >> 2, off = row % 2 ? 4 : 0;
      paint(buf, x, y, MAT.brick, (y - 188) % 4 === 3 || (x + off) % 8 === 7 ? 0.05 : 0.65, seed);
    });
    rect(372, 208, 36, 30, (x, y) => buf.set(x, y, hex("#2a0a04"), Kind.Back, 0));
    plate(buf, 368, 204, 44, 4, MAT.steel, Kind.Solid, seed + 9, 0.5);

    const lights: PointLight[] = [
      { x: 80, y: 32, color: COOL, radius: 170, intensity: 1.7 },
      { x: 400, y: 32, color: COOL, radius: 170, intensity: 1.7 },
      { x: 252, y: FLOOR - 6, color: HOTC, radius: 210, intensity: 1.7, flicker: 0.3 },
      { x: 390, y: 228, color: HOTC, radius: 110, intensity: 1.8, flicker: 0.6 },
      { x: 262, y: 150, color: HOTC, radius: 120, intensity: 0.9, flicker: 0.3 },
      { x: 254, y: 96, color: HOTC, radius: 90, intensity: 1.4, flicker: 0.2 },
      { x: 43, y: 128, color: hex("#40ff9a"), radius: 40, intensity: 0.5 },
    ];
    const lamp = (x: number) => {
      for (let y = 14; y < 24; y++) buf.set(x, y, CHAIN, Kind.Object, 0.2);
      rect(x - 4, 24, 9, 3, (lx, ly) => buf.set(lx, ly, hex("#3a4048"), Kind.Object, 0.6));
      rect(x - 3, 27, 7, 2, (lx, ly) => { buf.set(lx, ly, COOL, Kind.Object, 0); buf.glow(lx, ly, COOL, 1.6); });
    };
    lamp(80); lamp(400);

    const bobX = 168;
    return {
      buf,
      lights,
      ambient: [0.1, 0.1, 0.12],
      depth: { fade: 40, min: 0.35 },
      backLit: 0.85,
      grade: { tint: [1.05, 0.98, 0.92], vignette: 0.35, bloom: 0.9, threshold: 0.75 },
      frame(b, t) {
        // The pour: a wobbling column of molten pixels.
        for (let y = 72; y < FLOOR + 2; y++) {
          const wob = Math.round(Math.sin(y * 0.15 - t * 12) * 0.8 + (noise2(y * 0.2, t * 4, seed) - 0.5) * 1.5);
          const cx = 272 - Math.max(0, 80 - y) * 0.6 + wob;
          for (let k = -1; k <= 1; k++) {
            const c = k === 0 ? MAT.molten.ramp[3] : MAT.molten.ramp[1];
            b.set(cx + k, y, c, Kind.Fluid, 0.1);
            b.glow(cx + k, y, c, 1.3);
          }
        }
        // Splash sparks and rising heat embers.
        for (let i = 0; i < 26; i++) {
          const life = 0.6 + hash1(i, seed) * 0.6, age = (t + hash1(i, seed + 1) * life) % life;
          const vx = (hash1(i, seed + 2) - 0.5) * 120, vy = -60 - hash1(i, seed + 3) * 80;
          const x = 272 + vx * age, y = FLOOR + 2 + vy * age + 160 * age * age;
          const c = age / life < 0.5 ? hex("#fff0a0") : HOTC;
          b.set(x, y, c, Kind.Object, 0); b.glow(x, y, c, 1.4 * (1 - age / life));
        }
        motes(b, 20, t, seed, [200, 120, 110, 110], hex("#ffb060"), 1, 10);
        flame(b, 226, FLOOR + 1, 4, 10, t, seed + 1, 0.9);
        flame(b, 384, 237, 8, 22, t, seed + 2, 1);
        flame(b, 398, 237, 7, 18, t + 0.4, seed + 3, 1);
        plume(b, 446, 92, 90, t, seed, STEAM, 0.55, 0.9, 18);
        plume(b, 252, FLOOR - 2, 70, t * 0.8, seed + 4, ["#3a3634", "#4a4440"].map(hex), 0.25, 0.4, 10);
        // Control box screen and blinking LEDs.
        for (let r = 0; r < 4; r++) {
          const n = 6 + Math.floor(hash2(r, Math.floor(t * 2), seed) * 14);
          for (let x = 0; x < n; x++) if (hash2(x, r, seed) > 0.25) { b.set(33 + x, 124 + r * 3, hex("#40ff9a"), Kind.Object, 0.6); b.glow(33 + x, 124 + r * 3, hex("#40ff9a"), 0.8); }
        }
        for (let i = 0; i < 3; i++) {
          const on = Math.sin(t * (2 + i * 1.3) + i) > 0;
          const c = [hex("#ff3030"), hex("#ffd030"), hex("#30ff60")][i];
          b.set(36 + i * 6, 140, on ? c : scale(c, 0.3), Kind.Object, 0.6);
          if (on) b.glow(36 + i * 6, 140, c, 1.5);
        }
        // Bob, too close to the heat: slumping into a puddle with drips off the edge.
        const slump = 0.78 + Math.sin(t * 1.5) * 0.04;
        const lobes: Lobe[] = [
          { x: bobX, y: FLOOR - 12 * slump + 1, r: 12, sx: 1.2, sy: slump },
          { x: bobX - 13, y: FLOOR - 3, r: 6, sx: 1.6, sy: 0.5 },
          { x: bobX + 14, y: FLOOR - 3, r: 7, sx: 1.5, sy: 0.5 },
          { x: bobX + 24, y: FLOOR - 1.5, r: 3.5, sx: 1.8, sy: 0.5 },
        ];
        drawBob(b, lobes, { palette, state: "hot", t, loose: 0.8, selfLit: 0.3, eyes: { x: bobX + 2, y: FLOOR - 16, look: 1, size: 2 } });
        motes(b, 8, t, seed + 9, [bobX - 14, FLOOR - 40, 28, 22], hex("#c8ccd0"), 0, 6);
      },
    };
  },
};
