// Tier 4, code: it type-checks, the tests pass, the site builds, and the conventions in
// CLAUDE.md that a script can test still hold.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseScenario } from "../../../game/src/scenario.ts";
import { type Check, type Ctx, fail, findInCode, pass, sourceFiles, tail } from "./check.ts";

const pnpmScript = (id: string, script: string, hint: string, slow = false): Check => ({
  id,
  tier: 4,
  slow,
  repro: `pnpm ${script}`,
  hint,
  run({ sh }: Ctx) {
    const r = sh("pnpm", [script]);
    return r.code === 0 ? pass() : fail(`pnpm ${script} failed`, tail(r.out));
  },
});

export const typecheck = pnpmScript("code/typecheck", "typecheck", "A type error: the output names the package and line.");
export const test = pnpmScript("code/test", "test", "A failing test: the output names the package and test.");
export const build = pnpmScript("code/build", "build:site", "The site doesn't build: a prototype's Vite build, or scripts/build-site.mjs.", true);

/** Where simulation and generation live: they must be deterministic. */
export const DETERMINISTIC = ["packages/sim/src", "packages/bob/src", "game/src", "prototypes/00-stills/src", "prototypes/03-bot-search/src", "prototypes/04-audio/src"];

export const determinism: Check = {
  id: "code/no-math-random",
  tier: 4,
  repro: `grep -rn "Math.random" ${DETERMINISTIC.join(" ")}`,
  hint: "Simulation and generation are deterministic: use World.rand() in the sim and the seeded helpers in kit/rng.ts in the stills.",
  run({ root }) {
    const files = DETERMINISTIC.flatMap((d) => sourceFiles(root, d));
    const hits = findInCode(root, files, /\bMath\.random\b/);
    return hits.length ? fail(`${hits.length} use${hits.length === 1 ? "" : "s"}`, hits.join("\n")) : pass(`${files.length} files`);
  },
};

/** Packages that run in Workers and Node, so may not touch the DOM. */
export const NO_DOM = ["packages/sim/src", "packages/bob/src", "game/src/play.ts", "game/src/levels.ts", "game/src/png.ts", "game/src/scenario.ts", "game/src/report.ts", "game/src/replay.ts", "game/src/filmstrip.ts", "game/src/stick.ts", "game/src/bot.ts"];
const DOM_GLOBALS = /\b(document|window|navigator|localStorage|sessionStorage|requestAnimationFrame|HTML\w*Element|CanvasRenderingContext2D|OffscreenCanvas|ImageData)\b/;

export const noDom: Check = {
  id: "code/no-dom",
  tier: 4,
  repro: `grep -rnE "document|window|HTML.*Element|requestAnimationFrame" ${NO_DOM.join(" ")}`,
  hint: "packages/sim, packages/bob and the game's play, levels, scenario, report, replay, filmstrip, stick and bot are renderer-agnostic (no DOM), so they run in a Worker and in Node. Move DOM code to packages/render or game/src/main.ts.",
  run({ root }) {
    const files = NO_DOM.flatMap((d) => sourceFiles(root, d));
    const hits = findInCode(root, files, DOM_GLOBALS);
    return hits.length ? fail(`${hits.length} use${hits.length === 1 ? "" : "s"}`, hits.join("\n")) : pass(`${files.length} files`);
  },
};

/** Formats read anywhere (the health check, the scripts), so they import nothing. */
export const NO_IMPORTS = ["game/src/scenario.ts", "game/src/replay.ts"];

export const noImports: Check = {
  id: "code/no-imports",
  tier: 4,
  repro: `grep -n "^import" ${NO_IMPORTS.join(" ")}`,
  hint: "The scenario and replay formats import nothing, so the health check and Node scripts can read them alone. Move what it needs into the file, or the code that needs the import elsewhere.",
  run({ root }) {
    const hits = NO_IMPORTS.filter((f) => existsSync(join(root, f))).flatMap((f) =>
      readFileSync(join(root, f), "utf8").split("\n").flatMap((line, i) => (/^\s*(import|export\s.*\sfrom)\s/.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : [])),
    );
    return hits.length ? fail(`${hits.length} import${hits.length === 1 ? "" : "s"}`, hits.join("\n")) : pass(`${NO_IMPORTS.length} files`);
  },
};

export const SCENARIOS = "game/scenarios";

export const scenarios: Check = {
  id: "code/scenarios",
  tier: 4,
  repro: "pnpm --filter @pixelbob/game test",
  hint: "A scenario in game/scenarios/ doesn't follow the format in game/src/scenario.ts (studio/README.md#scenarios-putting-you-where-the-change-is), so its ?scenario= link would show an error.",
  run({ root }) {
    const dir = join(root, SCENARIOS);
    const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
    const problems: string[] = [];
    for (const name of names) {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
      } catch (e) {
        problems.push(`${SCENARIOS}/${name}: not JSON (${(e as Error).message})`);
        continue;
      }
      for (const error of parseScenario(name.replace(/\.json$/, ""), raw).errors) problems.push(`${SCENARIOS}/${name}: ${error}`);
    }
    return problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(`${names.length} scenario${names.length === 1 ? "" : "s"}`);
  },
};

export const LEVELS = "game/levels";
/** The levels tool, run from this checkout whichever root is checked (a test hands it a fixture). */
const LEVELS_TOOL = fileURLToPath(new URL("../../../game/scripts/levels.ts", import.meta.url));

export const levels: Check = {
  id: "code/levels",
  tier: 4,
  repro: "node game/scripts/levels.ts",
  hint: "A painted level in game/levels/ doesn't follow the format (docs/tech-and-toolchain.md#level-format): a colour that isn't in the level palette (`node game/scripts/levels.ts palette <out.gpl>`), something off the map, or a missing spawn or finish. Its scenarios won't start.",
  run({ root, sh }) {
    const dir = join(root, LEVELS);
    if (!existsSync(dir)) return pass("no levels");
    const r = sh("node", [LEVELS_TOOL, dir]);
    const last = r.out.trim().split("\n").pop() ?? "";
    return r.code === 0 ? pass(last) : fail(last || "the levels tool didn't run", tail(r.out));
  },
};

export const REPLAYS = "game/replays";

/** Every painted level is proven finishable: a kept replay of one of its scenarios finishes it (code/replays checks it still does). */
export const finishable: Check = {
  id: "code/finishable",
  tier: 4,
  repro: "node game/scripts/bot.ts <scenario> --keep",
  hint: "A level in game/levels/ has no kept replay that finishes it, so nothing proves it can be finished. Run the search bot on one of its scenarios with --keep (or keep a run of your own with `node game/scripts/replays.ts --add`). See docs/tech-and-toolchain.md#the-game.",
  run({ root }) {
    const read = (path: string): Record<string, unknown> | undefined => {
      try {
        return JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    };
    const json = (dir: string) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith(".json")).sort() : []);
    const ids = existsSync(join(root, LEVELS)) ? readdirSync(join(root, LEVELS), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
    const finished = new Set<string>();
    for (const name of json(REPLAYS)) {
      const file = read(`${REPLAYS}/${name}`);
      const scenario = typeof file?.replay === "string" ? /^pixelbob-replay v1 (\S+) /.exec(file.replay)?.[1] : undefined;
      const level = scenario && read(`${SCENARIOS}/${scenario}.json`)?.level;
      if (typeof level === "string" && Number((file?.expect as { finished?: unknown } | undefined)?.finished) > 0) finished.add(level);
    }
    const missing = ids.filter((id) => !finished.has(id));
    return missing.length ? fail(`${missing.length} level${missing.length === 1 ? "" : "s"} not proven finishable`, missing.map((id) => `${LEVELS}/${id}: no kept replay finishes it`).join("\n")) : pass(`${ids.length} level${ids.length === 1 ? "" : "s"}`);
  },
};

export const replays: Check = {
  id: "code/replays",
  tier: 4,
  slow: true,
  repro: "node game/scripts/replays.ts",
  hint: "A replay in game/replays/ no longer comes to the outcome it expects: the change altered how that run plays. If that's the point (a level got easier), run `node game/scripts/replays.ts --update` and say so in the PR; if not, it's a bug. See studio/README.md#automated-playtesting.",
  run({ sh }) {
    const r = sh("node", ["game/scripts/replays.ts"]);
    const last = r.out.trim().split("\n").pop() ?? "";
    return r.code === 0 ? pass(last) : fail(last || "the replays didn't run", tail(r.out));
  },
};

// Cheap scans first, so a broken convention shows before the slow runs.
export const CODE = [determinism, noDom, noImports, scenarios, levels, finishable, typecheck, test, replays, build];
