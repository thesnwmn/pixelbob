import { readdirSync, readFileSync } from "node:fs";
import { RANGES, runniness } from "@pixelbob/bob";
import { LOOKS } from "@pixelbob/render";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/levels.ts";
import { Play } from "../src/play.ts";
import { buildName, report } from "../src/report.ts";
import { LEVEL_IDS, LOOK_IDS, TWEAK_KEYS, parseScenario, type Scenario } from "../src/scenario.ts";

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

  it("has what /feedback asks for", () => {
    const text = report({
      build: "preview/pr-21",
      commit: "abc1234",
      scenario: "shell",
      seconds: 42.4,
      fun: 4,
      difficulty: "right",
      notes: "Rolled well.\n",
      answers: [{ question: "Was the card enough?", answer: "Yes" }, { question: "Anything missing?", answer: " " }],
    });
    expect(text).toBe(
      [
        "Pixelbob feedback",
        "---",
        "build: preview/pr-21 (abc1234)",
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
        "none: replays aren't recorded yet",
        "",
      ].join("\n"),
    );
  });
});
