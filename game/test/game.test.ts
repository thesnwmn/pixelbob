import { readdirSync, readFileSync } from "node:fs";
import { DEFAULTS, RANGES, hopLean, runniness } from "@pixelbob/bob";
import { LOOKS } from "@pixelbob/render";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/levels.ts";
import { filmstrip } from "../src/filmstrip.ts";
import { GONE, Play, TOUCH, checkReplay, runReplay } from "../src/play.ts";
import { decode, encode, findReplay, parseReplayFile, quantize, type Frame } from "../src/replay.ts";
import { buildName, report } from "../src/report.ts";
import { LEVEL_IDS, LEVEL_WIDTHS, LOOK_IDS, TWEAK_KEYS, parseScenario, type Scenario } from "../src/scenario.ts";
import { loadLevels } from "../scripts/load-levels.ts";

loadLevels();

const dir = new URL("../scenarios/", import.meta.url);
const scenarios: Scenario[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const { scenario, errors } = parseScenario(f.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(f, dir), "utf8")));
    expect(errors, f).toEqual([]);
    return scenario!;
  });

describe("the scenario format", () => {
  it("names what the game has: its levels, the renderer's looks and Bob's tweaks", () => {
    expect([...LEVEL_IDS].sort()).toEqual(Object.keys(LEVELS).sort());
    for (const id of LEVEL_IDS) expect(LEVELS[id].build(7).world.w, id).toBe(LEVEL_WIDTHS[id]);
    expect([...LOOK_IDS].sort()).toEqual(Object.keys(LOOKS).sort());
    expect([...TWEAK_KEYS].sort()).toEqual(Object.keys(RANGES).sort());
  });

  it("fills in the defaults", () => {
    const { scenario } = parseScenario("plain", { title: "Plain", level: "course" });
    expect(scenario).toEqual({ id: "plain", title: "Plain", level: "course", seed: 7, at: undefined, bob: { tweaks: {} }, camera: { zoom: 3, look: "day" }, card: undefined });
  });

  it("says what's wrong with a broken one", () => {
    const { scenario, errors } = parseScenario("Bad_Id", {
      title: "",
      level: "the-moon",
      zoom: 2,
      bob: { temp: 999, tweaks: { bounce: 1, jump: "high" } },
      camera: { look: "noon" },
      card: { try: ["roll", 3] },
    });
    expect(scenario).toBeUndefined();
    expect(errors.map((e) => e.split(":")[0])).toEqual([
      'the id "Bad_Id" (the file name) isn\'t kebab-case',
      "zoom",
      "title",
      "level",
      "bob.temp",
      "bob.tweaks.bounce",
      "bob.tweaks.jump",
      "camera.look",
      "card.changed",
      "card.try",
    ]);
  });

  it("keeps Bob's start inside the level", () => {
    expect(parseScenario("far", { title: "Far", level: "course", at: 14400 }).errors).toEqual(["at: a number of cells across the level, 1 to 1879"]);
  });

  it("isn't fooled by something that isn't an object", () => {
    expect(parseScenario("x", [1, 2]).errors).toEqual(["not a JSON object"]);
  });
});

describe("the scenarios", () => {
  it("include the default start, with no card", () => {
    expect(scenarios.find((s) => s.id === "start")?.card).toBeUndefined();
  });

  for (const s of scenarios) {
    it(`${s.id}: Bob starts where it says, on the ground, and plays`, () => {
      const play = new Play(s);
      const start = play.start();
      if (s.at !== undefined) expect(start.x).toBe(s.at);
      for (let i = 0; i < 60; i++) play.step({ move: 0, jump: false });
      const p = play.bob.main!;
      // Landed near where he started: neither fell through the world nor was flung.
      expect(Math.abs(p.cx - start.x)).toBeLessThan(15);
      expect(p.cy).toBeGreaterThan(start.y - 5);
      expect(p.cy).toBeLessThan(start.y + 25);
      if (s.bob.temp !== undefined) expect(p.temp).toBeCloseTo(s.bob.temp, 0);
    });
  }

  it("runny starts him runny", () => {
    const play = new Play(scenarios.find((s) => s.id === "runny")!);
    for (let i = 0; i < 60; i++) play.step({ move: 0, jump: false });
    expect(runniness(play.bob.main!.temp)).toBeGreaterThan(0.5);
  });

  it("restart puts everything back, deterministically", () => {
    const play = new Play(scenarios.find((s) => s.id === "ice")!);
    const run = () => {
      for (let i = 0; i < 90; i++) play.step({ move: i < 60 ? 1 : 0, jump: i === 30 });
      return [play.bob.main!.cx, play.bob.main!.cy, play.frame];
    };
    const first = run();
    play.restart();
    expect(play.frame).toBe(0);
    expect(run()).toEqual(first);
  });
});

describe("the feedback report", () => {
  it("knows the build from the page's path", () => {
    expect(buildName("/pixelbob/preview/pr-21/game/")).toBe("preview/pr-21");
    expect(buildName("/pixelbob/game/")).toBe("game");
    expect(buildName("/pixelbob/builds/alpha-1/")).toBe("builds/alpha-1");
    expect(buildName("/")).toBe("dev");
  });

  it("has what /playtest asks for", () => {
    const text = report({
      build: "preview/pr-21",
      commit: "abc1234",
      browser: "Mozilla/5.0 (iPhone)",
      scenario: "shell",
      seconds: 42.4,
      fun: 4,
      difficulty: "right",
      notes: "Rolled well.\n",
      answers: [{ question: "Was the card enough?", answer: "Yes" }, { question: "Anything missing?", answer: " " }],
      replay: "pixelbob-replay v1 shell 2: 8*2",
    });
    expect(text).toBe(
      [
        "Pixelbob feedback",
        "---",
        "build: preview/pr-21",
        "commit: abc1234",
        "browser: Mozilla/5.0 (iPhone)",
        "scenario: shell",
        "played: 42 s",
        "fun: 4",
        "difficulty: right",
        "frustration: ?",
        "---",
        "",
        "## What they said",
        "Rolled well.",
        "",
        "## The card's questions",
        "- Was the card enough?",
        "  Yes",
        "- Anything missing?",
        "  (not answered)",
        "",
        "## Replay",
        "```",
        "pixelbob-replay v1 shell 2: 8*2",
        "```",
        "",
      ].join("\n"),
    );
  });
});

const byId = new Map(scenarios.map((s) => [s.id, s]));
/** A short run with every kind of input: rolling, a stick at odd angles, jumps, crouching, climbing. */
const wiggle = (i: number) => ({ move: Math.sin(i / 7) * 1.3, jump: i % 40 < 5, down: i % 50 < 6 ? 0.3 : 0, up: i % 70 < 4 ? 1 : 0 });

describe("replays", () => {
  it("round input to eighths, the same way every time", () => {
    expect(quantize({ move: 0.37, jump: true })).toEqual({ move: 0.375, jump: true, back: false, down: 0, up: 0 });
    expect(quantize({ move: -3, jump: false, down: 2, up: -1 })).toEqual({ move: -1, jump: false, back: false, down: 1, up: 0 });
    expect(quantize({ move: Number.NaN, jump: false, down: -0.01 })).toEqual({ move: 0, jump: false, back: false, down: 0, up: 0 });
    expect(Object.is(quantize({ move: -0.01, jump: false }).move, 0)).toBe(true);
  });

  it("encode as runs, wrapped, and decode to the same frames", () => {
    const frames: Frame[] = Array.from({ length: 300 }, (_, i) => quantize(wiggle(i)));
    const text = encode("ice", frames, 60);
    expect(text.startsWith("pixelbob-replay v1 ice 300: ")).toBe(true);
    expect(Math.max(...text.split("\n").map((l) => l.length))).toBeLessThanOrEqual(60);
    expect(decode(text)).toEqual({ replay: { scenario: "ice", frames }, errors: [] });
    expect(encode("start", [quantize({ move: 1, jump: false }), quantize({ move: 1, jump: false }), quantize({ move: -0.5, jump: true, down: 1 })])).toBe("pixelbob-replay v1 start 3: 8*2 -4jd8");
    const back = [quantize({ move: 0, jump: true, back: true, up: 0.5 }), quantize({ move: 0, jump: false })];
    expect(encode("start", back)).toBe("pixelbob-replay v1 start 2: 0jbu4 0");
    expect(decode(encode("start", back)).replay!.frames).toEqual(back);
  });

  it("say what's wrong with a broken one", () => {
    expect(decode("replay v1 ice 3: 8*3").errors).toEqual(['replay: starts "pixelbob-replay v1 <scenario> <frames>:"']);
    expect(decode("pixelbob-replay v1 ice 3: 8*2").errors).toEqual(["replay: says 3 frames but has 2"]);
    expect(decode("pixelbob-replay v1 ice 3: 9*3").errors[0]).toContain('"9*3" isn\'t a run');
    expect(decode("pixelbob-replay v1 ice 0: 8*0").errors[0]).toContain('"8*0" isn\'t a run');
    expect(decode("pixelbob-replay v1 ice 3: 8*99999999999").errors).toEqual(["replay: says 3 frames but has more"]);
    expect(decode("pixelbob-replay v1 ice 99999999999: 8*99999999999").errors[0]).toContain("more than 432000");
  });

  it("are found in a pasted feedback report", () => {
    expect(findReplay("## Replay\n```\npixelbob-replay v1 ice 2: 8*2\n```\n")).toBe("pixelbob-replay v1 ice 2: 8*2");
    expect(findReplay("the pixelbob-replay v1 looked short\n```\npixelbob-replay v1 ice 2: 8*2\n```")).toBe("pixelbob-replay v1 ice 2: 8*2");
    expect(findReplay("no replay here")).toBe("");
  });

  it("play back exactly the run that was recorded", () => {
    const play = new Play(byId.get("ice")!);
    for (let i = 0; i < 240; i++) play.step(wiggle(i));
    const { replay } = decode(play.replay());
    const again = runReplay(byId.get("ice")!, replay!);
    expect(again.frame).toBe(240);
    expect(Array.from(again.bob.view().x)).toEqual(Array.from(play.bob.view().x));
    expect([again.bob.main!.cx, again.bob.main!.cy]).toEqual([play.bob.main!.cx, play.bob.main!.cy]);
    expect(again.outcome()).toEqual(play.outcome());
  });

  it("start again on restart", () => {
    const play = new Play(byId.get("start")!);
    for (let i = 0; i < 10; i++) play.step({ move: 1, jump: false });
    play.restart();
    play.step({ move: 0, jump: true });
    expect(play.replay()).toBe("pixelbob-replay v1 start 1: 0j");
  });

  it("are checked against the outcome they expect", () => {
    const text = encode("start", Array.from({ length: 30 }, () => quantize({ move: 1, jump: false })));
    const { file } = parseReplayFile("roll", { recorded: "2026-10-18", note: "Rolls right.", replay: text, expect: { frames: 30, finished: 0, home: 0, bob: 100, state: "00000000" } });
    const state = checkReplay(file!, byId).outcome!.state;
    expect(checkReplay({ ...file!, expect: { ...file!.expect, state } }, byId).problems).toEqual([]);
    expect(checkReplay(file!, byId).problems).toEqual([`state: expected 00000000, got ${state}`]);
    expect(checkReplay({ ...file!, expect: { ...file!.expect, state, home: 40, frames: 31 } }, byId).problems).toEqual(["frames: expected 31, got 30", "home: expected 40, got 0"]);
    expect(checkReplay({ ...file!, replay: { ...file!.replay, scenario: "moon" } }, byId).problems).toEqual(["it plays moon, which isn't in game/scenarios/"]);
  });

  it("files say what's wrong with them", () => {
    const { errors } = parseReplayFile("Bad", { replay: 3, expect: { frames: 1.5, home: -1, speed: 2 }, extra: true });
    expect(errors.map((e) => e.split(":")[0])).toEqual([
      'the id "Bad" (the file name) isn\'t kebab-case',
      "extra",
      "recorded",
      "note",
      "replay",
      "expect.speed",
      "expect.frames",
      "expect.finished",
      "expect.home",
      "expect.bob",
      "expect.state",
    ]);
  });
});

describe("checkpoints", () => {
  const tiny = () => new Play(byId.get("tiny")!);
  /** Rolls right until the first checkpoint lights (or gives up). */
  const toCheckpoint = (play: Play) => {
    for (let i = 0; i < 900 && !play.lit[0]; i++) play.step({ move: 1, jump: false });
    return play;
  };

  it("light when Bob touches one, and not before", () => {
    const play = tiny();
    expect(play.level.checkpoints.length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) play.step({ move: 0, jump: false });
    expect([play.lit, play.checkpoint]).toEqual([[false], -1]);
    toCheckpoint(play);
    expect([play.lit, play.checkpoint]).toEqual([[true], 0]);
    const c = play.level.checkpoints[0];
    expect(Math.abs(play.bob.main!.cx - c.x)).toBeLessThan(play.bob.main!.radius + TOUCH + 1);
  });

  it("bring Bob back there whole on R, with the level as it was, and the run goes on", () => {
    const play = toCheckpoint(tiny());
    for (let i = 0; i < 60; i++) play.step({ move: 1, jump: false });
    const frame = play.frame, world = play.level.world;
    play.step({ move: 0, jump: false, back: true });
    const c = play.above(play.level.checkpoints[0]), p = play.bob.main!;
    expect(play.level.world).not.toBe(world);
    expect(play.frame).toBe(frame + 1);
    expect(play.bob.count).toBe(play.bob.total);
    expect(Math.hypot(p.cx - c.x, p.cy - c.y)).toBeLessThan(3);
    expect(play.lit).toEqual([true]);
  });

  it("bring Bob back on R at the start when none is lit", () => {
    const play = tiny();
    for (let i = 0; i < 60; i++) play.step({ move: 1, jump: false });
    play.step({ move: 0, jump: false, back: true });
    expect(Math.abs(play.bob.main!.cx - play.level.spawn.x)).toBeLessThan(3);
  });

  it("bring Bob back after he's all lost", () => {
    const play = toCheckpoint(tiny());
    play.bob.shift(0, play.level.world.h + 10);
    play.step({ move: 0, jump: false });
    expect([play.bob.count, play.bob.main]).toEqual([0, undefined]);
    for (let i = 1; i < GONE; i++) play.step({ move: 0, jump: false });
    const c = play.above(play.level.checkpoints[0]), p = play.bob.main!;
    expect(play.bob.count).toBe(play.bob.total);
    expect(Math.hypot(p.cx - c.x, p.cy - c.y)).toBeLessThan(3);
  });

  it("go unlit on restart", () => {
    const play = toCheckpoint(tiny());
    play.restart();
    expect([play.lit, play.checkpoint]).toEqual([[false], -1]);
  });

  it("are in the replay: a run through one, back and on again, plays back exactly", () => {
    const play = toCheckpoint(tiny());
    for (let i = 0; i < 40; i++) play.step(wiggle(i));
    play.step({ move: 0, jump: false, back: true });
    for (let i = 0; i < 120; i++) play.step({ move: 1, jump: i % 50 < 4 });
    const again = runReplay(byId.get("tiny")!, decode(play.replay()).replay!);
    expect(again.lit).toEqual(play.lit);
    expect(again.outcome()).toEqual(play.outcome());
  });
});

describe("the kept replays", () => {
  const dir = new URL("../replays/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")))
    it(`${f} is in the format (code/replays plays it)`, () => {
      const { errors } = parseReplayFile(f.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(f, dir), "utf8")));
      expect(errors).toEqual([]);
    });
});

describe("filmstrips", () => {
  it("show key frames of a run, side by side, following Bob", () => {
    const text = encode("start", Array.from({ length: 120 }, () => quantize({ move: 1, jump: false })));
    const strip = filmstrip(byId.get("start")!, decode(text).replay!, { shots: 3, cw: 40, ch: 30, scale: 2 });
    expect(strip.frames).toEqual([40, 80, 120]);
    expect([strip.w, strip.h]).toEqual([3 * 80 + 2 * 2, 60]);
    expect(strip.rgba.length).toBe(strip.w * strip.h * 4);
    // He's rose pink, the one hue nothing else uses: some of each shot is him.
    for (let k = 0; k < 3; k++) {
      let pink = 0;
      for (let y = 0; y < 60; y++)
        for (let x = k * 82; x < k * 82 + 80; x++) {
          const o = (y * strip.w + x) * 4, [r, g, b] = [strip.rgba[o], strip.rgba[o + 1], strip.rgba[o + 2]];
          if (r > 180 && r - g > 50 && b > g) pink++;
        }
      expect(pink, `shot ${k}`).toBeGreaterThan(20);
    }
  });
});

describe("hopping", () => {
  const shell = () => scenarios.find((s) => s.id === "shell")!;
  /** Cells covered in `frames`, holding right, with jump held for `hold` of every `period` frames (0: rolling). */
  const run = (scenario: Scenario, frames: number, period: number, hold: number) => {
    const play = new Play(scenario);
    const x0 = play.bob.main!.cx;
    for (let i = 0; i < frames; i++) play.step({ move: 1, jump: period > 0 && i % period < hold });
    return play.bob.main!.cx - x0;
  };

  it("chained hops are faster than rolling, but not twice as fast", () => {
    const roll = run(shell(), 240, 0, 0);
    for (const [period, hold] of [[12, 5], [20, 8]]) {
      const hop = run(shell(), 240, period, hold);
      expect(hop / roll, `every ${period} frames`).toBeGreaterThan(1.2);
      expect(hop / roll, `every ${period} frames`).toBeLessThan(1.65);
    }
  });

  it("a single jump from a roll flies exactly as it would with hops uncapped, until it lands", () => {
    const xs = (hop: number) => {
      const s = shell();
      const play = new Play({ ...s, bob: { ...s.bob, tweaks: { ...s.bob.tweaks, hop } } });
      const out: number[] = [];
      for (let i = 0; i < 260; i++) {
        play.step({ move: 1, jump: i >= 150 && i < 165 });
        out.push(play.bob.main!.cx, play.bob.main!.cy);
      }
      return out;
    };
    const capped = xs(DEFAULTS.hop), free = xs(1);
    // Released at frame 165; he lands about 50 frames later, where the landing soak starts.
    expect(capped.slice(0, 2 * 210)).toEqual(free.slice(0, 2 * 210));
  });

  it("the lean forward fades with speed, never cuts off", () => {
    const tw = { speed: 70, hop: DEFAULTS.hop };
    let last = hopLean(0, tw);
    expect(last).toBe(1);
    for (let v = 0; v <= 140; v += 0.25) {
      const l = hopLean(v, tw);
      expect(l).toBeLessThanOrEqual(last);
      expect(last - l, `at ${v} px/s`).toBeLessThan(0.02);
      last = l;
    }
    expect(hopLean(70, tw)).toBe(1);
    expect(hopLean(70 * (1 + tw.hop), tw)).toBe(0);
  });
});
