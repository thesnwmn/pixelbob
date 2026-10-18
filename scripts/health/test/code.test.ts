import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { determinism, levels, noDom, noImports, replays, scenarios, typecheck } from "../src/code.ts";
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

function crc(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

describe("code/levels", () => {
  const tiny = (name: string) => readFileSync(new URL(`../../../game/levels/tiny/${name}`, import.meta.url));
  it("passes when there are none", () => expect(levels.run(ctx(tmpDir()))).toEqual({ status: "pass", detail: "no levels" }));
  it("passes on levels in the format", () => {
    const root = tmpDir({ "game/levels/tiny/level.json": tiny("level.json").toString() });
    writeFileSync(join(root, "game/levels/tiny/materials.png"), tiny("materials.png"));
    expect(levels.run(ctx(root))).toEqual({ status: "pass", detail: "1 level" });
  });
  it("fails on a broken one, saying what's wrong", () => {
    const root = tmpDir({
      "game/levels/lost/level.json": '{ "title": "Lost", "spawn": { "x": 999, "y": 5 }, "finish": { "x0": 0, "y0": 0, "x1": 10, "y1": 10 } }',
      "game/levels/blank/level.json": '{ "title": "Blank" }',
      "game/levels/odd/level.json": tiny("level.json").toString(),
    });
    // The tiny level's PNG with the rock entry in its palette changed: no material is painted that colour.
    const odd = Buffer.from(tiny("materials.png"));
    const plte = odd.indexOf("PLTE") + 4;
    odd[plte + 3] = 7;
    odd.writeUInt32BE(crc(odd.subarray(plte - 4, plte + odd.readUInt32BE(plte - 8))), plte + odd.readUInt32BE(plte - 8));
    writeFileSync(join(root, "game/levels/odd/materials.png"), odd);
    writeFileSync(join(root, "game/levels/lost/materials.png"), tiny("materials.png"));
    const r = levels.run(ctx(root));
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("3 of 3 levels broken");
    expect(r.out).toContain("game/levels/odd: materials.png: #07483f isn't a material's colour");
    expect(r.out).toContain("game/levels/lost: spawn: 999, 5 is off the map (160 × 60)");
    expect(r.out).toContain("game/levels/blank: materials.png: missing");
  });
});

describe("code/replays", () => {
  it("passes when every replay comes to what it expects", () => {
    const r = replays.run(ctx(tmpDir(), { sh: fakeShell({ "node game/scripts/replays.ts": { out: "1 replay\n" } }) }));
    expect(r).toEqual({ status: "pass", detail: "1 replay" });
  });
  it("fails on one that doesn't, saying what changed", () => {
    const out = "game/replays/course-run.json: home: expected 50, got 12\n1 of 1 replays differ\n";
    const r = replays.run(ctx(tmpDir(), { sh: fakeShell({ "node game/scripts/replays.ts": { code: 1, out } }) }));
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("1 of 1 replays differ");
    expect(r.out).toContain("home: expected 50, got 12");
  });
});

describe("code/no-imports", () => {
  it("passes on formats that import nothing", () => {
    expect(noImports.run(ctx(tmpDir({ "game/src/replay.ts": "// import nothing\nexport const v = 1;\n" }))).status).toBe("pass");
  });
  it("fails on one that imports, naming the line", () => {
    const r = noImports.run(ctx(tmpDir({ "game/src/replay.ts": 'export const v = 1;\nimport { World } from "@pixelbob/sim";\n', "game/src/scenario.ts": 'export { x } from "./x.ts";\n' })));
    expect(r.status).toBe("fail");
    expect(r.out).toContain('game/src/replay.ts:2: import { World } from "@pixelbob/sim";');
    expect(r.out).toContain("game/src/scenario.ts:1:");
  });
});
