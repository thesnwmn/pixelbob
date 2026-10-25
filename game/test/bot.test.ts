import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forgiveness, jumps, search } from "../src/bot.ts";
import { Play, runReplay } from "../src/play.ts";
import { type Frame, decode } from "../src/replay.ts";
import { parseScenario, type Scenario } from "../src/scenario.ts";
import { loadLevels } from "../scripts/load-levels.ts";

loadLevels();
const scenario = (id: string): Scenario => parseScenario(id, JSON.parse(readFileSync(new URL(`../scenarios/${id}.json`, import.meta.url), "utf8"))).scenario!;
const kept = (id: string): Frame[] => decode((JSON.parse(readFileSync(new URL(`../replays/${id}.json`, import.meta.url), "utf8")) as { replay: string }).replay).replay!.frames;

describe("copying a run", () => {
  it("gives the same run as going on with the original, checkpoints and replay included", () => {
    const frames = kept("green-1-hills-run");
    const a = runReplay(scenario("green-1-hills"), { scenario: "green-1-hills", frames: frames.slice(0, 700) });
    const b = a.copy();
    for (const f of frames.slice(700, 1000)) {
      a.step(f);
      b.step(f);
    }
    expect(b.outcome()).toEqual(a.outcome());
    expect(b.replay()).toBe(a.replay());
    expect(b.lit).toEqual(a.lit);
    expect(b.respawns).toBe(a.respawns);
    // And they're independent: the copy's level isn't the original's.
    b.step({ move: 1, jump: false, back: true });
    expect(b.respawns).toBe(a.respawns + 1);
    expect(a.level.world).not.toBe(b.level.world);
  });
});

describe("the search bot", () => {
  it("finds the jumps in a route", () => {
    const f = (jump: boolean): Frame => ({ move: 1, jump, back: false, down: 0, up: 0 });
    expect(jumps([f(true), f(true), f(false), f(false), f(true), f(false), f(true)])).toEqual([{ start: 0, end: 2 }, { start: 4, end: 5 }, { start: 6, end: 7 }]);
  });

  it("finishes the tiny level, and its route plays back the same from the start", () => {
    const s = scenario("tiny");
    const r = search(new Play(s), { beam: 2, budget: 60_000 });
    expect(r.done).toBe(true);
    const again = runReplay(s, decode(r.best.replay()).replay!);
    expect(again.outcome()).toEqual(r.best.outcome());
    expect(again.finishedAt).toBeGreaterThan(0);
  });

  it("measures the high step on the first Green level: it needs a charged jump", () => {
    // The scripted run, from just before its full charge at the first high step (frame 879).
    const frames = kept("green-1-hills-run");
    const start = runReplay(scenario("green-1-hills"), { scenario: "green-1-hills", frames: frames.slice(0, 860) });
    const [step, ...rest] = forgiveness(start, frames.slice(860, 1100), { reach: 2, hold: 24 });
    expect(rest).toEqual([]);
    expect(step.jump).toEqual({ start: 19, end: 41 });
    expect(step.minHold).toBeGreaterThan(8);
    expect(step.maxHold).toBe(24);
    expect(step.early).toBe(2);
  });
});
