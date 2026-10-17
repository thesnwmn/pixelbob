// Tier 3, the repo: on a branch, nothing half-merged, the map in step with the folders,
// and at the end of a session, nothing left only in the container.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, fail, inCI, pass, skip, warn } from "./check.ts";

export const branch: Check = {
  id: "repo/branch",
  tier: 3,
  repro: "git branch --show-current",
  hint: "Work never happens on main (CLAUDE.md): switch to the session's branch.",
  run({ sh, env }) {
    const name = sh("git", ["branch", "--show-current"]).out.trim();
    if (!name) return skip("detached HEAD");
    if (name === "main") return inCI(env) ? pass("main (CI)") : fail("on main");
    return pass(name);
  },
};

export const conflicts: Check = {
  id: "repo/conflict-markers",
  tier: 3,
  repro: "git grep -nIE '^(<<<<<<<|>>>>>>>)( |$)'",
  hint: "A merge left conflict markers in a file: resolve them.",
  run({ sh }) {
    const r = sh("git", ["grep", "-nIE", "^(<<<<<<<|>>>>>>>)( |$)"]);
    if (r.code === 1) return pass();
    if (r.code !== 0) return fail("git grep failed", r.out);
    const files = [...new Set(r.out.trim().split("\n").map((l) => l.split(":")[0]))];
    return fail(`in ${files.join(", ")}`, r.out);
  },
};

/** The top-level folders the repo map in studio/README.md lists. */
export function mappedFolders(readme: string): Set<string> {
  const section = readme.split(/^## Repo structure$/m)[1] ?? "";
  const block = section.split("```")[1] ?? "";
  return new Set([...block.matchAll(/^ {2}([.\w-]+)\/(?=\s|$)/gm)].map((m) => m[1]));
}

export const repoMap: Check = {
  id: "repo/map",
  tier: 3,
  repro: "git ls-files -co --exclude-standard | cut -d/ -f1 | sort -u",
  hint: "A top-level folder isn't in the repo map (studio/README.md#repo-structure). A new top-level folder is a decision: add it to the map, with a record.",
  run({ root, sh }) {
    const readme = join(root, "studio/README.md");
    if (!existsSync(readme)) return fail("no studio/README.md");
    const mapped = mappedFolders(readFileSync(readme, "utf8"));
    if (!mapped.size) return fail("no repo map found under '## Repo structure'");
    const files = sh("git", ["ls-files", "-co", "--exclude-standard"]).out.trim().split("\n");
    const folders = new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]));
    const missing = [...folders].filter((f) => !mapped.has(f)).sort();
    return missing.length ? fail(`not in the map: ${missing.join(", ")}`) : pass(`${folders.size} folders`);
  },
};

export const behind: Check = {
  id: "repo/behind-main",
  tier: 3,
  repro: "git fetch origin main && git rev-list --count HEAD..origin/main",
  hint: "main has moved on: `git fetch origin main && git merge origin/main`. Counts against the last fetch.",
  run({ sh }) {
    if (sh("git", ["branch", "--show-current"]).out.trim() === "main") return skip("on main");
    if (sh("git", ["rev-parse", "--verify", "-q", "origin/main"]).code !== 0) return skip("no origin/main fetched");
    const n = Number(sh("git", ["rev-list", "--count", "HEAD..origin/main"]).out.trim());
    return n > 0 ? warn(`${n} commit${n === 1 ? "" : "s"} behind origin/main`) : pass("up to date with origin/main");
  },
};

export const clean: Check = {
  id: "repo/clean",
  tier: 3,
  end: true,
  repro: "git status --porcelain",
  hint: "Uncommitted changes are lost with the container: commit them, or remove what shouldn't be there.",
  run({ sh }) {
    const lines = sh("git", ["status", "--porcelain"]).out.trimEnd();
    if (!lines) return pass();
    return fail(`${lines.split("\n").length} uncommitted`, lines);
  },
};

export const pushed: Check = {
  id: "repo/pushed",
  tier: 3,
  end: true,
  repro: "git rev-list --count @{u}..HEAD",
  hint: "Commits that aren't pushed are lost with the container: `git push -u origin <branch>`.",
  run({ sh }) {
    const r = sh("git", ["rev-list", "--count", "@{u}..HEAD"]);
    if (r.code !== 0) return fail("no upstream branch");
    const n = Number(r.out.trim());
    return n > 0 ? fail(`${n} commit${n === 1 ? "" : "s"} not pushed`) : pass();
  },
};

export const REPO = [branch, conflicts, repoMap, behind, clean, pushed];
