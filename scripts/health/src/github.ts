// Tier 5, GitHub: the files that set up the repo on GitHub follow their formats. The
// gate's file list names files that exist and protects itself; the labels the studio
// uses all exist; the bug form files with one; the workflows that push to gh-pages
// can't cancel or overwrite main's deploy. The gate's own logic is gate.ts.
// See studio/README.md#github.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS } from "../../../studio/board.ts";
import { type Check, fail, pass, readJson } from "./check.ts";
import type { Gated } from "./gate.ts";

/** The gate's own files: a change to any of them changes what's gated, so it's gated too. */
export const GATE_FILES = [".github/gated.json", ".github/workflows/gate.yml", "scripts/health/src/gate.ts"];

/** Labels the studio and its workflows use, besides one per unit kind. */
export const LABELS = ["bug", "blocker", "gated", "producer-ok", "playtest"];

const problemsResult = (problems: string[], ok: string) =>
  problems.length ? fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}`, problems.join("\n")) : pass(ok);

export const gate: Check = {
  id: "github/gate",
  tier: 5,
  repro: "cat .github/gated.json",
  hint: "Every entry in .github/gated.json has a path that exists (a folder ends in /) and a why, and the gate's own files are on the list. The why for each: docs/decisions/2026-10-17-gated-files.md.",
  run({ root }) {
    const file = join(root, ".github/gated.json");
    if (!existsSync(file)) return fail("no .github/gated.json");
    const rules = readJson(file).gated;
    if (!Array.isArray(rules)) return fail('.github/gated.json has no "gated" list');
    const problems: string[] = [];
    for (const r of rules) {
      if (typeof r?.path !== "string" || typeof r?.why !== "string" || !r.why) problems.push(`${JSON.stringify(r)}: needs a path and a why`);
      else if (!existsSync(join(root, r.path))) problems.push(`${r.path}: no such ${r.path.endsWith("/") ? "folder" : "file"}`);
    }
    const paths = rules.map((r: Gated) => r?.path);
    for (const f of GATE_FILES) if (!paths.includes(f)) problems.push(`${f}: the gate's own file, so it must be gated`);
    return problemsResult(problems, `${rules.length} paths`);
  },
};

export const labels: Check = {
  id: "github/labels",
  tier: 5,
  repro: "cat .github/labels.json",
  hint: "Every label the studio uses (bug, blocker, gated, producer-ok, playtest, and one per unit kind) is in .github/labels.json with a six-digit hex colour, once; the bug form exists and files with labels from that list.",
  run({ root }) {
    const file = join(root, ".github/labels.json");
    if (!existsSync(file)) return fail("no .github/labels.json");
    const list: { name?: string; color?: string }[] = readJson(file).labels;
    if (!Array.isArray(list)) return fail('.github/labels.json has no "labels" list');
    const names = list.map((l) => l?.name);
    const problems = [
      ...list.filter((l) => !/^[0-9a-f]{6}$/i.test(l?.color ?? "")).map((l) => `${l?.name}: colour isn't six hex digits`),
      ...names.filter((n, i) => names.indexOf(n) !== i).map((n) => `${n}: listed twice`),
      ...[...LABELS, ...KINDS].filter((n) => !names.includes(n)).map((n) => `${n}: used by the studio, but not in .github/labels.json`),
    ];
    const form = join(root, ".github/ISSUE_TEMPLATE/bug.yml");
    if (!existsSync(form)) problems.push("no .github/ISSUE_TEMPLATE/bug.yml");
    else {
      const m = readFileSync(form, "utf8").match(/^labels:\s*\[([^\]]*)\]/m);
      const used = m ? m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
      if (!used.includes("bug")) problems.push(".github/ISSUE_TEMPLATE/bug.yml: doesn't label its issues bug");
      for (const n of used) if (!names.includes(n)) problems.push(`.github/ISSUE_TEMPLATE/bug.yml: label ${n} isn't in .github/labels.json`);
    }
    return problemsResult(problems, `${list.length} labels`);
  },
};

export const IN_STEP_WORKFLOW = ".github/workflows/in-step.yml";

export const inStep: Check = {
  id: "github/in-step",
  tier: 5,
  repro: `cat ${IN_STEP_WORKFLOW}`,
  hint: "The in-step workflow is what fails a PR that leaves its docs, unit or session log behind (studio/README.md#keeping-docs-and-the-studio-in-step): it runs scripts/health/src/instep.ts, and again when the PR description is edited.",
  run({ root }) {
    const path = join(root, IN_STEP_WORKFLOW);
    if (!existsSync(path)) return fail(`no ${IN_STEP_WORKFLOW}`);
    const yml = readFileSync(path, "utf8");
    const problems = [
      !yml.includes("node scripts/health/src/instep.ts") && "doesn't run scripts/health/src/instep.ts",
      !/types:\s*\[[^\]]*\bedited\b/.test(yml) && "doesn't run when the PR description is edited",
      !yml.includes("PR_BODY:") && "doesn't pass the description in PR_BODY",
    ].filter((p): p is string => !!p);
    return problems.length ? fail(problems.join("; ")) : pass();
  },
};

export const SITE_WORKFLOW = ".github/workflows/deploy-pages.yml";

export const pages: Check = {
  id: "github/pages",
  tier: 5,
  repro: "grep -n 'gh-pages\\|group:\\|force:' .github/workflows/*.yml",
  hint: "Main's deploy and the PR previews all push to gh-pages. GitHub keeps one pending run per concurrency group and cancels the older, so the site's deploy has a group to itself (a shared one let a preview cancel it, #47), and every push to gh-pages rebases or starts again when it's rejected (the deploy action's force: false), never overwrites. See docs/tech-and-toolchain.md#hosting-and-previews.",
  run({ root }) {
    const dir = join(root, ".github/workflows");
    if (!existsSync(join(root, SITE_WORKFLOW))) return fail(`no ${SITE_WORKFLOW}`);
    const groups = new Map<string, string[]>();
    const problems: string[] = [];
    let n = 0;
    for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
      const path = `.github/workflows/${f}`;
      const yml = readFileSync(join(dir, f), "utf8");
      if (!/^\s*(branch|ref):\s*gh-pages\s*$/m.test(yml)) continue;
      n++;
      const group = yml.match(/^\s*group:\s*(\S+)/m)?.[1];
      if (!group) problems.push(`${path}: pushes to gh-pages with no concurrency group`);
      else groups.set(group, [...(groups.get(group) ?? []), path]);
      if (yml.includes("github-pages-deploy-action") && !/^\s*force:\s*false\s*$/m.test(yml))
        problems.push(`${path}: the deploy action force-pushes (its default) and can overwrite another push: set force: false`);
      if (/\bgit push\b/.test(yml) && !/\bgit fetch\b/.test(yml)) problems.push(`${path}: pushes to gh-pages and gives up, or overwrites, when the push is rejected`);
    }
    const site = readFileSync(join(root, SITE_WORKFLOW), "utf8").match(/^\s*group:\s*(\S+)/m)?.[1];
    for (const other of (site && groups.get(site)) || []) if (other !== SITE_WORKFLOW) problems.push(`${other}: shares the site's concurrency group ${site}, so it can cancel main's deploy`);
    return problemsResult(problems, `${n} workflows`);
  },
};

export const GITHUB = [gate, labels, inStep, pages];
