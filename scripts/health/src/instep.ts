// Tier 5, on a branch: what a PR changes brings its docs, its unit and its session log
// with it, or its description says why not. See studio/README.md#keeping-docs-and-the-studio-in-step.
//
// A PR's description is written last, so in a session these only warn. What enforces them
// is the in-step workflow, which runs on every edit to the description as well as every
// push, as `PR_BODY=… node scripts/health/src/instep.ts <base> <head>`, and fails the PR.
// Only node: imports, so it runs without an install.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Check, type Ctx, type Result, type Shell, inCI, pass, realShell, skip, warn } from "./check.ts";
import { githubRepo } from "./repo.ts";

export interface DocMapEntry {
  paths: string[];
  docs: string[];
}

/** What a PR changes, and what its description says. */
export interface Pr {
  /** Every path the PR adds, changes or deletes (renames as both), from `git diff --name-status --no-renames`. */
  changes: { status: string; path: string }[];
  body: string;
}

export const DOC_MAP = "studio/doc-map.json";

export const readDocMap = (root: string): DocMapEntry[] => JSON.parse(readFileSync(join(root, DOC_MAP), "utf8")).map;

/** A doc-map glob as a RegExp: `**` is any path, `*` any name. */
export const globRe = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split("**")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
      .join(".*")}$`,
  );

/** A doc's file (or folder, ending in /) without its #heading. */
const docPath = (doc: string): string => doc.split("#")[0];
const touches = (doc: string, path: string): boolean => (doc.endsWith("/") ? path.startsWith(doc) : path === docPath(doc));

/** The reason after `<label> <phrase> because`, outside HTML comments, if it gives one ("…" doesn't count). */
export function excuse(body: string, label: string, phrase: string): string | undefined {
  const text = body.replace(/<!--[\s\S]*?-->/g, "");
  const m = text.match(new RegExp(`${label}:\\**\\s*${phrase},? because\\b(.*)`, "i"));
  return m && /[\p{L}\p{N}]/u.test(m[1]) ? m[1].trim() : undefined;
}

/** For each doc-map entry whose code changed and none of whose docs did, what's missing. */
export function docsProblems(map: DocMapEntry[], pr: Pr): string[] {
  if (excuse(pr.body, "Docs", "none needed")) return [];
  const paths = pr.changes.map((c) => c.path);
  const res = map.map((e) => e.paths.map(globRe));
  const byEntry = new Map<number, string[]>();
  for (const path of paths) {
    const i = res.findIndex((r) => r.some((re) => re.test(path)));
    if (i >= 0 && !map[i].docs.some((d) => touches(d, path))) byEntry.set(i, [...(byEntry.get(i) ?? []), path]);
  }
  return [...byEntry].flatMap(([i, changed]) => {
    const { docs } = map[i];
    if (paths.some((p) => docs.some((d) => touches(d, p)))) return [];
    const more = changed.length > 1 ? ` (and ${changed.length - 1} more)` : "";
    return [`${changed[0]}${more} changed, but not ${docs.join(" or ")}`];
  });
}

/** A PR that changes anything outside studio/ changes a unit, or says `Unit: none, because …`. */
export function unitProblem(pr: Pr): string | undefined {
  const outside = pr.changes.find((c) => !c.path.startsWith("studio/"));
  if (!outside || excuse(pr.body, "Unit", "none")) return undefined;
  if (pr.changes.some((c) => /^studio\/work\/[^/]+\.md$/.test(c.path))) return undefined;
  return `${outside.path} changed, but no unit in studio/work/`;
}

/** Every PR adds a session log, or says `Session log: none, because …`. */
export function sessionLogProblem(pr: Pr): string | undefined {
  if (!pr.changes.length || excuse(pr.body, "Session log", "none")) return undefined;
  if (pr.changes.some((c) => c.status === "A" && /^studio\/sessions\/[^/]+\.md$/.test(c.path))) return undefined;
  return "no new log in studio/sessions/";
}

/** What `git diff --name-status --no-renames base head` lists. */
export function changesBetween(sh: Shell, base: string, head: string): Pr["changes"] | string {
  const r = sh("git", ["diff", "--name-status", "--no-renames", base, head]);
  if (r.code !== 0) return r.out.trim().split("\n")[0] || "git diff failed";
  return r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [status, path] = l.split("\t");
      return { status: status[0], path };
    });
}

/** The branch against main, and the description of its open PR (empty if there isn't one yet). */
function branchPr(ctx: Ctx): Pr | Result {
  const { sh, env } = ctx;
  if (inCI(env)) return skip("in CI, the in-step workflow checks it");
  const name = sh("git", ["branch", "--show-current"]).out.trim();
  if (!name || name === "main") return skip(name ? "on main" : "detached HEAD");
  const base = sh("git", ["merge-base", "origin/main", "HEAD"]);
  if (base.code !== 0) return skip("no origin/main fetched");
  const changes = changesBetween(sh, base.out.trim(), "HEAD");
  if (typeof changes === "string") return skip(changes);
  let body = "";
  const repo = githubRepo(sh("git", ["remote", "get-url", "origin"]).out);
  if (repo && changes.length) {
    const r = sh("gh", ["api", `repos/${repo}/pulls?head=${repo.split("/")[0]}:${name}&state=open`, "--jq", ".[0].body // \"\""]);
    if (r.code === 0) body = r.out;
  }
  return { changes, body };
}

/** Results are kept per run: the three checks share one diff and one call to GitHub. */
const prs = new WeakMap<Ctx, Pr | Result>();
const prOf = (ctx: Ctx): Pr | Result => {
  if (!prs.has(ctx)) prs.set(ctx, branchPr(ctx));
  return prs.get(ctx)!;
};
const isPr = (x: Pr | Result): x is Pr => "changes" in x;

const verdictOf = (problems: string[], ok: string): Result =>
  problems.length ? { ...warn(problems.length === 1 ? problems[0] : `${problems.length} problems`), out: problems.join("\n") } : pass(ok);

export const docsInStep: Check = {
  id: "docs/in-step",
  tier: 5,
  repro: "git diff --name-only $(git merge-base origin/main HEAD) (against studio/doc-map.json)",
  hint: "The branch changes code a doc describes (studio/doc-map.json) and not the doc: bring the doc in step, or say `Docs: none needed, because …` in the PR description.",
  run(ctx) {
    const pr = prOf(ctx);
    if (!isPr(pr)) return pr;
    if (!existsSync(join(ctx.root, DOC_MAP))) return warn(`no ${DOC_MAP}`);
    return verdictOf(docsProblems(readDocMap(ctx.root), pr), `${pr.changes.length} file${pr.changes.length === 1 ? "" : "s"}`);
  },
};

export const unit: Check = {
  id: "studio/unit",
  tier: 5,
  repro: "git diff --name-only $(git merge-base origin/main HEAD) -- studio/work",
  hint: "The branch changes more than studio/ and no unit: update the unit's status and log, or say `Unit: none, because …` in the PR description.",
  run(ctx) {
    const pr = prOf(ctx);
    if (!isPr(pr)) return pr;
    const problem = unitProblem(pr);
    return verdictOf(problem ? [problem] : [], pr.changes.length ? "changed" : "nothing to land");
  },
};

export const sessionLog: Check = {
  id: "studio/session-log",
  tier: 5,
  repro: "git diff --name-status $(git merge-base origin/main HEAD) -- studio/sessions",
  hint: "Every PR from a session adds its log, studio/sessions/<date>-<slug>.md (studio/README.md#session-logs), or says `Session log: none, because …` in the PR description.",
  run(ctx) {
    const pr = prOf(ctx);
    if (!isPr(pr)) return pr;
    const problem = sessionLogProblem(pr);
    return verdictOf(problem ? [problem] : [], pr.changes.length ? "added" : "nothing to land");
  },
};

export const IN_STEP = [docsInStep, unit, sessionLog];

/** The in-step workflow's verdict on a PR: every problem, one per line. */
export const prProblems = (map: DocMapEntry[], pr: Pr): string[] =>
  [...docsProblems(map, pr), unitProblem(pr), sessionLogProblem(pr)].filter((p): p is string => !!p);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const [base, head = "HEAD"] = process.argv.slice(2);
  const changes = changesBetween(realShell(root), base, head);
  if (typeof changes === "string") {
    console.log(`::error::${changes}`);
    process.exit(1);
  }
  const problems = prProblems(readDocMap(root), { changes, body: process.env.PR_BODY ?? "" });
  for (const p of problems) console.log(`::error::${p}`);
  if (problems.length) {
    console.log("Bring them in step, or say why not in the PR description: `Docs: none needed, because …`, `Unit: none, because …`, `Session log: none, because …`.");
    process.exit(1);
  }
  console.log(`In step: ${changes.length} file${changes.length === 1 ? "" : "s"}.`);
}
