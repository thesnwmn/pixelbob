import { describe, expect, it } from "vitest";
import { determinism, noDom, scenarios, typecheck } from "../src/code.ts";
import { ctx, fakeShell, tmpDir } from "./fixture.ts";

describe("code/typecheck (and the other pnpm runs)", () => {
  it("passes when the script does", () => expect(typecheck.run(ctx(tmpDir(), { sh: fakeShell({ "pnpm typecheck": {} }) })).status).toBe("pass"));
  it("fails with the output when it doesn't", () => {
    const r = typecheck.run(ctx(tmpDir(), { sh: fakeShell({ "pnpm typecheck": { code: 2, out: "src/a.ts(1,7): error TS2322" } }) }));
    expect(r.status).toBe("fail");
    expect(r.out).toContain("TS2322");
  });
});

describe("code/no-math-random", () => {
  it("ignores mentions in comments", () => {
    const root = tmpDir({ "packages/sim/src/world.ts": "// never Math.random()\n/* nor Math.random */\nexport const r = (w: W) => w.rand();\n" });
    expect(determinism.run(ctx(root)).status).toBe("pass");
  });
  it("fails on a call in the sim", () => {
    const r = determinism.run(ctx(tmpDir({ "packages/bob/src/goo.ts": "const a = 1;\nconst jitter = Math.random() * 0.1;\n" })));
    expect(r.status).toBe("fail");
    expect(r.out).toBe("packages/bob/src/goo.ts:2: const jitter = Math.random() * 0.1;");
  });
});

describe("code/no-dom", () => {
  it("passes on renderer-agnostic code", () => expect(noDom.run(ctx(tmpDir({ "packages/sim/src/a.ts": "export const windowSize = 4;\n" }))).status).toBe("pass"));
  it("fails on the DOM in the game's headless play", () => {
    const r = noDom.run(ctx(tmpDir({ "game/src/play.ts": "export const w = window.innerWidth;\n", "game/src/main.ts": "document.title = 'ok';\n" })));
    expect(r.status).toBe("fail");
    expect(r.out).toBe("game/src/play.ts:1: export const w = window.innerWidth;");
  });
  it("fails on the DOM in Bob", () => {
    const r = noDom.run(ctx(tmpDir({ "packages/bob/src/draw.ts": "const c = document.createElement('canvas');\n" })));
    expect(r.status).toBe("fail");
  });
});

describe("code/scenarios", () => {
  it("passes on scenarios in the format", () => {
    const r = scenarios.run(ctx(tmpDir({ "game/scenarios/start.json": '{ "title": "Start", "level": "course" }' })));
    expect(r).toEqual({ status: "pass", detail: "1 scenario" });
  });
  it("fails on a broken one, saying what's wrong", () => {
    const r = scenarios.run(ctx(tmpDir({
      "game/scenarios/ok.json": '{ "title": "Fine", "level": "course" }',
      "game/scenarios/moon.json": '{ "title": "The moon", "level": "moon" }',
      "game/scenarios/half.json": '{ "title": ',
    })));
    expect(r.status).toBe("fail");
    expect(r.out).toContain("game/scenarios/moon.json: level: one of course");
    expect(r.out).toContain("game/scenarios/half.json: not JSON");
  });
});
