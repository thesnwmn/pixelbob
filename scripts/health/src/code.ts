// Tier 4, code: it type-checks, the tests pass, the site builds, and the conventions in
// CLAUDE.md that a script can test still hold.
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
export const DETERMINISTIC = ["packages/sim/src", "packages/bob/src", "prototypes/00-stills/src"];

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
export const NO_DOM = ["packages/sim/src", "packages/bob/src"];
const DOM_GLOBALS = /\b(document|window|navigator|localStorage|sessionStorage|requestAnimationFrame|HTML\w*Element|CanvasRenderingContext2D|OffscreenCanvas|ImageData)\b/;

export const noDom: Check = {
  id: "code/no-dom",
  tier: 4,
  repro: `grep -rnE "document|window|HTML.*Element|requestAnimationFrame" ${NO_DOM.join(" ")}`,
  hint: "packages/sim and packages/bob are renderer-agnostic (no DOM), so they run in a Worker and in Node. Move DOM code to packages/render or the app.",
  run({ root }) {
    const files = NO_DOM.flatMap((d) => sourceFiles(root, d));
    const hits = findInCode(root, files, DOM_GLOBALS);
    return hits.length ? fail(`${hits.length} use${hits.length === 1 ? "" : "s"}`, hits.join("\n")) : pass(`${files.length} files`);
  },
};

// Cheap scans first, so a broken convention shows before the slow runs.
export const CODE = [determinism, noDom, typecheck, test, build];
