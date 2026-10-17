// A scenario being played: the level's world and Bob, stepped at 60 Hz. No DOM, so the
// tests (and later replays and bots) run it in Node; main.ts draws it and feeds it input.
import { type BobModel, DEFAULTS, type Input, type Tweaks, createBob } from "@pixelbob/bob";
import { CAT, Cat } from "@pixelbob/sim";
import { type Built, LEVELS } from "./levels.ts";
import type { Scenario } from "./scenario.ts";

export const STEP = 1 / 60;

export class Play {
  readonly scenario: Scenario;
  readonly tweaks: Tweaks;
  level!: Built;
  bob!: BobModel;
  /** Frames since the start. */
  frame = 0;
  /** The frame the main piece reached the finish, or 0. */
  finishedAt = 0;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.tweaks = { ...DEFAULTS, ...scenario.bob.tweaks, drive: scenario.bob.drive ?? DEFAULTS.drive };
    this.restart();
  }

  /** Back to the scenario's start: a fresh level and a fresh Bob. */
  restart(): void {
    const s = this.scenario;
    this.level = LEVELS[s.level].build(s.seed);
    this.bob = createBob(this.tweaks, s.seed);
    this.bob.fixedTemp = s.bob.temp ?? null;
    const at = this.start();
    this.bob.spawn(this.level.world, at.x, at.y, s.bob.temp ?? 20, this.level.bits);
    this.frame = 0;
    this.finishedAt = 0;
  }

  /** Where Bob starts: the level's spawn, or on the ground at `at`. */
  start(): { x: number; y: number } {
    const { world, spawn } = this.level;
    const at = this.scenario.at;
    if (at === undefined) return spawn;
    const x = Math.max(1, Math.min(world.w - 2, Math.round(at)));
    // The ground is the top of the solid run up from the bottom (not, say, a brazier overhead).
    // So a column open to the bottom of the world, or with a cave in it, puts him low: pick `at` on solid ground.
    let top = world.h - 1;
    const open = (y: number) => {
      const c = CAT[world.mat[y * world.w + x]];
      return c === Cat.Empty || c === Cat.Gas;
    };
    while (top > 0 && !open(top - 1)) top--;
    return { x, y: top - this.tweaks.size - 3 };
  }

  step(input: Input): void {
    this.level.world.step();
    this.bob.step(this.level.world, input);
    this.frame++;
    const p = this.bob.main, f = this.level.finish;
    if (!this.finishedAt && p && p.cx >= f.x0 && this.home() > 0) this.finishedAt = this.frame;
  }

  /** How much of Bob is in the finish box, 0 to 1. */
  home(): number {
    const f = this.level.finish;
    return this.bob.countIn(f.x0, f.y0, f.x1, f.y1) / this.bob.total;
  }

  /** Seconds played, stopping at the finish. */
  seconds(): number {
    return (this.finishedAt || this.frame) * STEP;
  }
}
