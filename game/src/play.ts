// A scenario being played: the level's world and Bob, stepped at 60 Hz, recording its
// input as a replay. No DOM, so the tests, replays and bots run it in Node; main.ts draws
// it and feeds it input.
import { type BobModel, DEFAULTS, type Input, type Tweaks, createBob } from "@pixelbob/bob";
import { CAT, Cat } from "@pixelbob/sim";
import { type Built, LEVELS } from "./levels.ts";
import { type Outcome, Recorder, type Replay, type ReplayFile, quantize } from "./replay.ts";
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
  /** Every frame's input since the start (or the last restart). */
  readonly recorder = new Recorder();

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
    this.recorder.clear();
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

  /** One frame. The input is rounded to eighths (`quantize`) and recorded, so the replay is exactly this run. */
  step(input: Input): void {
    const q = quantize(input);
    this.recorder.push(q);
    this.level.world.step();
    this.bob.step(this.level.world, q);
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
    };
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
