// What the music follows, read from the game each frame: a handful of numbers from 0 to 1, each
// eased so it glides rather than jumps (nothing about Bob switches, and the music mustn't either).
// No DOM and no Web Audio, so it runs in Node (`pnpm notes` in this folder).
import type { BobModel } from "@pixelbob/bob";
import { CAT, Cat, type World } from "@pixelbob/sim";

export interface Mood {
  /** How fast he's going: thickens the melody's rhythm and opens the pad. */
  energy: number;
  /** How high he is over the level's hills (0 at the lowest ground, 1 at the highest): lifts the melody's register. */
  height: number;
  /** In the air: the melody holds and shimmers rather than walks. */
  air: number;
  /** Winding up a jump (his charge): a rising arpeggio that the jump lets go of. */
  wind: number;
  /** How much of him is in water: the music sinks under it, darker and slower. */
  wet: number;
  /** How warm he is, from cold (0) through the world's 20°C (0.25) to boiling (1): a hotter, brighter pad. */
  warmth: number;
  /** How far through the level, by x from the start to the finish: the band fills out as he goes. */
  progress: number;
  /** How long he's been resting: the melody thins out until only the pad is left. */
  rest: number;
}

export const MOOD_KEYS = ["energy", "height", "air", "wind", "wet", "warmth", "progress", "rest"] as const;

/** Bob's insides the model interface doesn't name. */
interface Inside { charge: number }

/** How fast each number eases towards where the game is, per second: the charge and the air follow at once; speed is twitchy, so it eases slower; warmth, progress and rest drift. */
const EASE: Record<keyof Mood, number> = { energy: 1.2, height: 1.5, air: 4, wind: 8, wet: 3, warmth: 0.5, progress: 0.5, rest: 0.4 };

export class Follower {
  readonly mood: Mood = { energy: 0, height: 0.5, air: 0, wind: 0, wet: 0, warmth: 0.25, progress: 0, rest: 1 };
  /** The top of the ground in each column, so height is over the hills rather than the screen. */
  private top: Int32Array;
  private lo: number; private hi: number;
  private airFrames = 0; private still = 0;
  private start: number; private finish: number;

  constructor(world: World, start: number, finish: number) {
    this.start = start; this.finish = finish;
    const { w, h, mat } = world;
    this.top = new Int32Array(w).fill(h);
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        const c = CAT[mat[y * w + x]];
        if (c === Cat.Static || c === Cat.Powder) { this.top[x] = y; break; }
      }
    // The hills' range, ignoring columns with no ground (a ravine's floor is still ground).
    let lo = h, hi = 0;
    for (let x = 0; x < w; x++) if (this.top[x] < h) { lo = Math.min(lo, this.top[x]); hi = Math.max(hi, this.top[x]); }
    this.lo = lo; this.hi = Math.max(lo + 1, hi);
  }

  /** Read the game after a step of `dt` seconds. */
  follow(bob: BobModel, dt: number): Mood {
    const m = this.mood, p = bob.main;
    const target: Mood = { ...m };
    if (p) {
      const speed = Math.hypot(p.vx, p.vy);
      // About 70 px/s is his rolling top speed; downhill and jumping go past it.
      target.energy = Math.min(1, speed / 90);
      target.height = Math.max(0, Math.min(1, (this.hi - (p.cy + p.radius)) / (this.hi - this.lo)));
      this.airFrames = p.ground > 0 ? 0 : this.airFrames + 1;
      // A few frames off the ground is a bump, not flight.
      target.air = Math.min(1, Math.max(0, this.airFrames - 6) / 20);
      target.wind = Math.min(1, (bob as unknown as Inside).charge);
      target.wet = p.wet;
      target.warmth = Math.max(0, Math.min(1, (p.temp + 20) / 160));
      target.progress = Math.max(0, Math.min(1, (p.cx - this.start) / (this.finish - this.start)));
      this.still = speed < 12 && target.wind < 0.05 ? this.still + dt : 0;
      // Rest starts after two seconds still and is full after ten.
      target.rest = Math.min(1, Math.max(0, this.still - 2) / 8);
    } else {
      // He's gone, for a moment: the band holds its breath.
      target.energy = 0; target.air = 0; target.wind = 0;
    }
    for (const k of MOOD_KEYS) m[k] += (target[k] - m[k]) * Math.min(1, EASE[k] * dt);
    return m;
  }
}
