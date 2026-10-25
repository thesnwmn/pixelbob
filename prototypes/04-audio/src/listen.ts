// What Bob sounds like this frame, read from numbers the sim and Bob already have. No DOM and
// no Web Audio, so it runs in Node (`pnpm cues` in this folder prints what a scripted run hears).
import { type BobModel } from "@pixelbob/bob";
import { M, type World } from "@pixelbob/sim";

/** The kind of ground he's rolling on, which colours the roll. */
export type Ground = "soft" | "hard" | "slick" | "sticky" | "sharp";

/** Continuous voices (0..1 each, set every frame) and one-shot events this frame. */
export interface Cues {
  /** Rolling on the ground: how loud, how fast (px/s), and on what. */
  roll: number;
  speed: number;
  ground: Ground;
  /** His surface turning over onto the ground: particles that touched down this frame, and that
   *  peeled off it (the roll's pulses come from these). */
  touch: number;
  peel: number;
  /** His goo wobbling: how much his particles move against each other. */
  wobble: number;
  /** Winding up a jump (the charge, 0..1). */
  charge: number;
  /** Under water (not lava): how much of him, and how fast he's moving through it. */
  wet: number;
  /** How hot he's being cooked: particles near boiling, and bits boiled off this frame. */
  sizzle: number;
  /** Hitting the ground or a wall this frame, by how much his speed changed (px/s), on what. */
  impact: number;
  impactOn: Ground;
  /** Took off this frame, with the charge the jump had (0 for a tap). */
  jump: number;
  /** Fell into water (not lava) this frame, by how fast he was going (px/s). */
  splash: number;
  /** Torn this frame: links broken by an impact (spikes, a hard landing). */
  tear: number;
}

const SOFT = new Set<number>([M.plant, M.dirt, M.sand, M.snow, M.mud, M.moss, M.ash]);
const SLICK = new Set<number>([M.ice]);
const STICKY = new Set<number>([M.resin, M.gum]);
const SHARP = new Set<number>([M.spike]);
const WATERY = new Set<number>([M.water, M.brine, M.mud]);
const groundOf = (m: number): Ground => (SHARP.has(m) ? "sharp" : STICKY.has(m) ? "sticky" : SLICK.has(m) ? "slick" : SOFT.has(m) ? "soft" : "hard");

/** Bob's insides that the model interface doesn't name but the body has. */
interface Inside {
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; t: Float32Array;
  alive: Uint8Array; piece: Int32Array; cmat: Uint8Array; cap: number;
  charge: number; stretch: number; banked: number; losses: { boiled: number }; breaks: { impact: number };
}

/** Reads Bob after each step and remembers what it needs from the step before. */
export class Listener {
  private vx = 0; private vy = 0;
  private touching = new Uint8Array(0);
  private stretch = 0; private air = 0; private dry = true; private out = 99; private boiled = 0; private torn = 0; private since = 99;
  readonly cues: Cues = { roll: 0, speed: 0, ground: "soft", touch: 0, peel: 0, wobble: 0, charge: 0, wet: 0, sizzle: 0, impact: 0, impactOn: "soft", jump: 0, splash: 0, tear: 0 };

  /** Forget the last frame (a respawn mustn't sound like a landing). */
  reset(bob: BobModel): void {
    const p = bob.main, b = bob as unknown as Inside;
    this.air = 0; this.vx = p?.vx ?? 0; this.vy = p?.vy ?? 0; this.dry = true; this.out = 99;
    this.stretch = b.stretch; this.boiled = b.losses.boiled; this.torn = b.breaks.impact; this.since = 99;
    // Whatever he's touching now was already down: the first frame mustn't count it as touching down.
    this.touching = new Uint8Array(b.cap);
    for (let i = 0; i < b.cap; i++) this.touching[i] = b.alive[i] && b.cmat[i] ? 1 : 0;
  }

  hear(bob: BobModel, world: World): Cues {
    const c = this.cues, p = bob.main, b = bob as unknown as Inside;
    c.impact = c.jump = c.splash = c.tear = c.touch = c.peel = 0;
    if (!p) { c.roll = c.wobble = c.charge = c.wet = c.sizzle = 0; return c; }
    const { x, y, vx, vy, t, alive, piece, cmat, cap } = b;
    const main = bob.pieces.indexOf(p);
    if (this.touching.length !== cap) this.touching = new Uint8Array(cap);
    const was = this.touching;
    // One pass over his particles: what he touches, how he wobbles, how hot he is.
    const touched = new Map<number, number>();
    // Rolling spins his particles round his middle, which isn't wobble: take out the spin first.
    let am = 0, r2 = 0;
    for (let i = 0; i < cap; i++) {
      if (!alive[i] || piece[i] !== main) continue;
      const rx = x[i] - p.cx, ry = y[i] - p.cy;
      am += rx * (vy[i] - p.vy) - ry * (vx[i] - p.vx);
      r2 += rx * rx + ry * ry;
    }
    const w = r2 > 0 ? am / r2 : 0;
    // Bob's own wetness counts any liquid, lava too: water's voices only hear water.
    let jig = 0, hot = 0, n = 0, inWater = 0;
    for (let i = 0; i < cap; i++) {
      if (!alive[i] || piece[i] !== main) continue;
      n++;
      const rx = x[i] - p.cx, ry = y[i] - p.cy;
      const dvx = vx[i] - p.vx + w * ry, dvy = vy[i] - p.vy - w * rx;
      jig += dvx * dvx + dvy * dvy;
      if (t[i] > 70) hot += Math.min(1, (t[i] - 70) / 30);
      if (world.inside(Math.floor(x[i]), Math.floor(y[i])) && WATERY.has(world.mat[Math.floor(y[i]) * world.w + Math.floor(x[i])])) inWater++;
      // The cell he's touching underneath, if any (cmat is set on contact).
      const below = world.inside(Math.floor(x[i]), Math.floor(y[i]) + 1) ? world.mat[(Math.floor(y[i]) + 1) * world.w + Math.floor(x[i])] : M.rock;
      if (cmat[i] && below !== M.air) touched.set(cmat[i], (touched.get(cmat[i]) ?? 0) + 1);
      const now = cmat[i] ? 1 : 0;
      if (now && !was[i]) c.touch++;
      else if (!now && was[i]) c.peel++;
      was[i] = now;
    }
    let most = M.rock, top = 0;
    for (const [m, k] of touched) if (k > top) { top = k; most = m; }
    const on = groundOf(most), grounded = p.ground > 0, speed = Math.hypot(p.vx, p.vy);

    c.speed = speed;
    c.ground = on;
    c.roll = grounded ? Math.min(1, Math.abs(p.vx) / 90) * Math.min(1, (p.ground / Math.max(1, p.len)) * 6) : 0;
    // Rolling, his goo jiggles about 15 to 24 px/s rms against the spin; count what's above that.
    c.wobble = Math.min(1, Math.max(0, Math.sqrt(jig / Math.max(1, n)) - 18) / 40);
    c.charge = Math.min(1, b.charge);
    const wet = inWater / Math.max(1, n);
    c.wet = wet * Math.min(1, speed / 60);
    const boiled = b.losses.boiled - this.boiled;
    c.sizzle = Math.min(1, hot / Math.max(1, n) * 3 + boiled * 0.2);

    // Events, each with a short refractory time so one landing isn't three.
    this.since++;
    const dv = Math.hypot(p.vx - this.vx, p.vy - this.vy);
    // A landing is touching down after a moment in the air, as hard as he was falling (or
    // flying) just before; a bump on the ground is a sudden change of speed.
    if (grounded && this.air >= 6) { c.impact = Math.max(dv, this.vy, Math.abs(this.vx) * 0.5); c.impactOn = on; this.since = 0; }
    else if (grounded && dv > 70 && this.since > 6) { c.impact = dv; c.impactOn = on; this.since = 0; }
    this.air = grounded ? 0 : this.air + 1;
    // He springs the frame his stretch is set (0.14), with the charge he banked (a tap banks none).
    if (b.stretch > this.stretch + 0.05) c.jump = Math.max(0.01, b.banked);
    // One splash going in (as fast as he was going), and none again until he's been out a moment.
    if (this.dry && wet > 0.08) { c.splash = Math.max(20, Math.hypot(this.vx, this.vy)); this.dry = false; }
    this.out = wet < 0.01 ? this.out + 1 : 0;
    if (this.out > 15) this.dry = true;
    const torn = b.breaks.impact;
    c.tear = Math.min(1, (torn - this.torn) / 6);

    this.vx = p.vx; this.vy = p.vy;
    this.stretch = b.stretch; this.boiled = b.losses.boiled; this.torn = torn;
    return c;
  }
}
