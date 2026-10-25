// A scenario being played: the level's world and Bob, stepped at 60 Hz, recording its
// input as a replay. No DOM, so the tests, replays and bots run it in Node; main.ts draws
// it and feeds it input.
import { type BobModel, DEFAULTS, type Input, type Tweaks, createBob } from "@pixelbob/bob";
import { CAT, Cat, copyFields } from "@pixelbob/sim";
import { POST, ground } from "./checkpoint.ts";
import { type Built, LEVELS } from "./levels.ts";
import { type Outcome, Recorder, type Replay, type ReplayFile, quantize } from "./replay.ts";
import type { Scenario } from "./scenario.ts";

export const STEP = 1 / 60;
/** How near a checkpoint's post or lantern, in cells, a bit of Bob's main piece has to come to light it. */
export const TOUCH = 6;
/** How long Bob stays gone, in frames, before he comes back at the last checkpoint. */
export const GONE = 60;

export class Play {
  readonly scenario: Scenario;
  readonly tweaks: Tweaks;
  level!: Built;
  bob!: BobModel;
  /** Frames since the start. */
  frame = 0;
  /** The frame the main piece reached the finish, or 0. */
  finishedAt = 0;
  /** Which of the level's checkpoints Bob has touched. */
  lit: boolean[] = [];
  /** The one he comes back to: the last he touched, or -1 for the start. */
  checkpoint = -1;
  /** How many times he's come back at a checkpoint (or the start) since the start. */
  respawns = 0;
  /** Frames since all of Bob was lost, or 0. */
  gone = 0;
  /** Which of Bob's particles have been in his main piece: a lost bit he hasn't picked up isn't him. */
  private was = new Uint8Array(0);
  /** Every frame's input since the start (or the last restart). */
  readonly recorder = new Recorder();

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.tweaks = { ...DEFAULTS, ...scenario.bob.tweaks, drive: scenario.bob.drive ?? DEFAULTS.drive };
    this.restart();
  }

  /**
   * An exact, independent copy of the run so far (the world, Bob, the checkpoints, the replay):
   * the bots branch from it rather than replaying from the start. Stepping both the same way keeps them the same.
   */
  copy(): Play {
    const world = this.level.world.copy();
    return copyFields(this, Object.create(Play.prototype) as Play, {
      scenario: this.scenario,
      tweaks: this.tweaks,
      level: { ...this.level, world },
      bob: this.bob.copy(world),
      recorder: this.recorder.copy(),
    });
  }

  /** Back to the scenario's start: a fresh level and a fresh Bob, no checkpoints lit, and a new replay. */
  restart(): void {
    this.checkpoint = -1;
    this.respawn();
    this.respawns = 0;
    this.lit = this.level.checkpoints.map(() => false);
    this.frame = 0;
    this.finishedAt = 0;
    this.recorder.clear();
  }

  /** Bob back whole at the last checkpoint (or the start), with the level as it was at the start. The run goes on. */
  respawn(): void {
    const s = this.scenario;
    const level = LEVELS[s.level];
    if (!level) throw new Error(`the level ${s.level} isn't loaded (the browser loads game/levels/ in main.ts, Node with scripts/load-levels.ts)`);
    this.level = level.build(s.seed);
    this.bob = createBob(this.tweaks, s.seed);
    this.bob.fixedTemp = s.bob.temp ?? null;
    const at = this.checkpoint < 0 ? this.start() : this.above(this.level.checkpoints[this.checkpoint]);
    this.bob.spawn(this.level.world, at.x, at.y, s.bob.temp ?? 20, this.level.bits);
    // All of him at the start is him (the lost bits are their own pieces).
    const { order } = this.bob.view(), p = this.bob.main!;
    this.was = new Uint8Array(order.length);
    for (let j = p.start; j < p.start + p.len; j++) this.was[order[j]] = 1;
    this.gone = 0;
    this.respawns++;
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

  /** Where Bob comes back to at a checkpoint: standing on the ground its post stands on. */
  above(c: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.round(c.x), y: ground(this.level.world, c) - this.tweaks.size - 3 };
  }

  /**
   * One frame. The input is rounded to eighths (`quantize`) and recorded, so the replay is exactly
   * this run. `back` (R) and losing all of Bob for `GONE` frames bring him back at the last checkpoint.
   */
  step(input: Input & { back?: boolean }): void {
    const q = quantize(input);
    this.recorder.push(q);
    if (q.back) this.respawn();
    this.level.world.step();
    this.bob.step(this.level.world, q);
    this.frame++;
    if (!this.here()) {
      if (++this.gone >= GONE) this.respawn();
      return;
    }
    this.touch();
    const p = this.bob.main, f = this.level.finish;
    if (!this.finishedAt && p && p.cx >= f.x0 && this.home() > 0) this.finishedAt = this.frame;
  }

  /**
   * Whether any of Bob is left: his main piece holds something that's been him. When all that's
   * left is lost bits he never picked up, he's lost; a piece he left behind can take over.
   */
  private here(): boolean {
    const p = this.bob.main;
    if (!p) return false;
    const { order } = this.bob.view(), was = this.was;
    let him = false;
    for (let j = p.start; j < p.start + p.len && !him; j++) him = was[order[j]] === 1;
    if (him) for (let j = p.start; j < p.start + p.len; j++) was[order[j]] = 1;
    return him;
  }

  /** Lights the checkpoints the main piece touches; the last one touched is where he comes back. */
  private touch(): void {
    const p = this.bob.main;
    if (!p) return;
    const { x, y, order } = this.bob.view();
    this.level.checkpoints.forEach((c, k) => {
      // The post and lantern, from the ground up: the nearest point on it to each bit of him.
      const cx = Math.round(c.x) + 0.5, gy = ground(this.level.world, c);
      for (let j = p.start; j < p.start + p.len; j++) {
        const i = order[j], py = Math.max(gy - POST, Math.min(gy, y[i]));
        if ((x[i] - cx) ** 2 + (y[i] - py) ** 2 <= TOUCH * TOUCH) {
          this.lit[k] = true;
          this.checkpoint = k;
          return;
        }
      }
    });
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

  /** The run so far as a replay's text. */
  replay(): string {
    return this.recorder.text(this.scenario.id);
  }

  outcome(): Outcome {
    return {
      frames: this.frame,
      finished: this.finishedAt,
      home: Math.round(this.home() * 100),
      bob: Math.round((this.bob.count / this.bob.total) * 100),
      state: this.fingerprint(),
    };
  }

  /** FNV-1a over Bob's particles (their exact bits) and the world's cells, as 8 hex digits. */
  fingerprint(): string {
    let h = 0x811c9dc5;
    const mix = (a: ArrayLike<number>) => {
      for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
    };
    const v = this.bob.view();
    for (const f of [v.x, v.y, v.vx, v.vy, v.t]) mix(new Uint32Array(f.buffer, f.byteOffset, f.length));
    mix(this.level.world.mat);
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}

/** Plays a replay from its scenario's start, headless; `each` sees the play after every frame. */
export function runReplay(scenario: Scenario, replay: Replay, each?: (play: Play) => void): Play {
  if (replay.scenario !== scenario.id) throw new Error(`the replay is of ${replay.scenario}, not ${scenario.id}`);
  const play = new Play(scenario);
  for (const f of replay.frames) {
    play.step(f);
    each?.(play);
  }
  return play;
}

/** Plays a kept replay and compares the outcome with what it expects: what differs, if anything. */
export function checkReplay(file: ReplayFile, scenarios: ReadonlyMap<string, Scenario>): { outcome?: Outcome; problems: string[] } {
  const scenario = scenarios.get(file.replay.scenario);
  if (!scenario) return { problems: [`it plays ${file.replay.scenario}, which isn't in game/scenarios/`] };
  const outcome = runReplay(scenario, file.replay).outcome();
  const problems = (Object.keys(outcome) as (keyof Outcome)[])
    .filter((k) => outcome[k] !== file.expect[k])
    .map((k) => `${k}: expected ${file.expect[k]}, got ${outcome[k]}`);
  return { outcome, problems };
}
