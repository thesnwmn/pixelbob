// Tier 2, dependencies: installed from the lockfile, and every package can find its own.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Check, fail, pass, readJson, tail, workspaceDirs } from "./check.ts";

export const install: Check = {
  id: "deps/install",
  tier: 2,
  repro: "pnpm install --frozen-lockfile",
  hint: "package.json and pnpm-lock.yaml disagree: run `pnpm install` and commit the lockfile. Or the registry is unreachable.",
  run({ sh }) {
    // Installing is the check: it's quick when nothing changed, and a fresh container has no node_modules.
    const r = sh("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
    return r.code === 0 ? pass("matches pnpm-lock.yaml") : fail("install from the lockfile failed", tail(r.out));
  },
};

export const resolve: Check = {
  id: "deps/resolve",
  tier: 2,
  repro: "pnpm install --frozen-lockfile",
  hint: "A package's dependency isn't in its node_modules: a partial install, or a package added to the workspace without installing.",
  run({ root }) {
    const dirs = [".", ...workspaceDirs(root)];
    const missing: string[] = [];
    for (const dir of dirs) {
      const pkg = readJson(join(root, dir, "package.json"));
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (!existsSync(join(root, dir, "node_modules", name, "package.json"))) missing.push(`${dir}: ${name}`);
      }
    }
    if (missing.length) return fail(`${missing.length} missing: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`);
    return pass(`${dirs.length} packages`);
  },
};

export const DEPS = [install, resolve];
