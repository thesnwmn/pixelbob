// Tier 1, tools: the container has what the repo needs, at the versions it pins.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, fail, pass, readJson } from "./check.ts";

/** Node strips types without a flag from 22.18, and the scripts rely on it. */
export const NODE_MIN: [number, number] = [22, 18];

export const node: Check = {
  id: "tools/node",
  tier: 1,
  repro: "node --version; cat .nvmrc",
  hint: "The container's Node isn't the one in .nvmrc. Install that major (CI reads .nvmrc too).",
  run({ root, node }) {
    const [major, minor] = node.replace(/^v/, "").split(".").map(Number);
    const nvmrc = join(root, ".nvmrc");
    if (!existsSync(nvmrc)) return fail("no .nvmrc to pin Node");
    const pinned = Number(readFileSync(nvmrc, "utf8").trim().replace(/^v/, "").split(".")[0]);
    if (major !== pinned) return fail(`${node}, but .nvmrc pins ${pinned}`);
    if (major === NODE_MIN[0] && minor < NODE_MIN[1]) return fail(`${node}, older than ${NODE_MIN.join(".")}: it can't run .ts files`);
    return pass(node);
  },
};

export const pnpm: Check = {
  id: "tools/pnpm",
  tier: 1,
  repro: "pnpm --version",
  hint: "pnpm isn't the version package.json's packageManager names. `corepack enable` picks it up from there.",
  run({ root, sh }) {
    const wanted = String(readJson(join(root, "package.json")).packageManager ?? "").replace(/^pnpm@/, "").split("+")[0];
    if (!wanted) return fail("package.json has no packageManager");
    const r = sh("pnpm", ["--version"]);
    if (r.code !== 0) return fail("pnpm not found", r.out);
    const got = r.out.trim();
    return got === wanted ? pass(got) : fail(`${got}, but packageManager is pnpm@${wanted}`);
  },
};

export const git: Check = {
  id: "tools/git",
  tier: 1,
  repro: "git --version",
  hint: "git isn't installed, or this isn't a git checkout.",
  run({ sh }) {
    const v = sh("git", ["--version"]);
    if (v.code !== 0) return fail("git not found", v.out);
    const repo = sh("git", ["rev-parse", "--is-inside-work-tree"]);
    if (repo.code !== 0) return fail("not a git checkout", repo.out);
    return pass(v.out.trim().replace(/^git version /, ""));
  },
};

export const TOOLS = [node, pnpm, git];
