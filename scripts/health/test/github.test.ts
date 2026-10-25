import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KINDS } from "../../../studio/board.ts";
import { gatedHits, verdict } from "../src/gate.ts";
import { GATE_FILES, gate, IN_STEP_WORKFLOW, inStep, LABELS, labels, pages, SITE_WORKFLOW } from "../src/github.ts";
import { ctx, tmpDir } from "./fixture.ts";

const rules = [
  { path: "studio/producer.md", why: "settings" },
  { path: ".claude/", why: "the harness" },
];

describe("the gate's matcher", () => {
  it("matches files exactly and folders by prefix", () =>
    expect(gatedHits(rules, ["studio/producer.md", ".claude/skills/go/SKILL.md", "packages/bob/src/goo.ts"])).toEqual([
      "studio/producer.md (settings)",
      ".claude/skills/go/SKILL.md (the harness)",
    ]));
  it("holds a gated PR until producer-ok, and labels it once", () => {
    expect(verdict(["a (x)"], [])).toEqual({ hits: ["a (x)"], label: true, pass: false });
    expect(verdict(["a (x)"], ["gated"])).toMatchObject({ label: false, pass: false });
    expect(verdict(["a (x)"], ["gated", "producer-ok"])).toMatchObject({ label: false, pass: true });
  });
  it("holds a PR labelled gated by hand, with no gated files", () => expect(verdict([], ["gated"])).toMatchObject({ label: false, pass: false }));
  it("passes a PR that isn't gated", () => expect(verdict([], ["build"])).toEqual({ hits: [], label: false, pass: true }));
  it("doesn't match a file that only starts like one", () => expect(gatedHits(rules, ["studio/producer.md.bak", ".claudeish"])).toEqual([]));
});

/** A gate list holding the gate's own files (which the fixture creates) and `extra`. */
const gateFixture = (extra: object[] = [], files: Record<string, string> = {}) =>
  tmpDir({
    ".github/gated.json": JSON.stringify({ gated: [...GATE_FILES.map((path) => ({ path, why: "the gate" })), ...extra] }),
    ...Object.fromEntries(GATE_FILES.filter((f) => f !== ".github/gated.json").map((f) => [f, ""])),
    ...files,
  });

describe("github/gate", () => {
  it("passes on the repo's own list", () => expect(gate.run(ctx(process.cwd() + "/../..")).status).toBe("pass"));
  it("passes on paths that exist", () => expect(gate.run(ctx(gateFixture([{ path: "studio/", why: "x" }], { "studio/a.md": "" }))).status).toBe("pass"));
  it("fails on a path that doesn't exist", () => {
    const r = gate.run(ctx(gateFixture([{ path: "studio/directon.md", why: "typo" }])));
    expect(r.status).toBe("fail");
    expect(r.out).toBe("studio/directon.md: no such file");
  });
  it("fails on an entry without a why", () => expect(gate.run(ctx(gateFixture([{ path: ".github/gated.json" }]))).out).toMatch(/needs a path and a why/));
  it("fails when the gate doesn't gate itself", () => {
    const r = gate.run(ctx(tmpDir({ ".github/gated.json": JSON.stringify({ gated: [] }) })));
    expect(r.status).toBe("fail");
    expect(r.out).toContain(".github/workflows/gate.yml: the gate's own file, so it must be gated");
  });
  it("fails without the list", () => expect(gate.run(ctx(tmpDir())).detail).toBe("no .github/gated.json"));
});

const allLabels = [...LABELS, ...KINDS].map((name) => ({ name, color: "c5def5" }));
const form = "name: Bug\nlabels: [bug]\nbody: []\n";
const labelFixture = (list: object[], bug = form) => tmpDir({ ".github/labels.json": JSON.stringify({ labels: list }), ".github/ISSUE_TEMPLATE/bug.yml": bug });

describe("github/labels", () => {
  it("passes on the repo's own labels and bug form", () => expect(labels.run(ctx(process.cwd() + "/../..")).status).toBe("pass"));
  it("passes with every label the studio uses", () => expect(labels.run(ctx(labelFixture(allLabels))).status).toBe("pass"));
  it("fails without producer-ok", () => {
    const r = labels.run(ctx(labelFixture(allLabels.filter((l) => l.name !== "producer-ok"))));
    expect(r.status).toBe("fail");
    expect(r.out).toBe("producer-ok: used by the studio, but not in .github/labels.json");
  });
  it("fails on a bad colour and a duplicate", () =>
    expect(labels.run(ctx(labelFixture([...allLabels, { name: "bug", color: "#d73a4a" }]))).out).toBe("bug: colour isn't six hex digits\nbug: listed twice"));
  it("fails on a bug form that doesn't label its issues bug", () =>
    expect(labels.run(ctx(labelFixture(allLabels, "name: Bug\nlabels: [triage]\n"))).out).toBe(
      ".github/ISSUE_TEMPLATE/bug.yml: doesn't label its issues bug\n.github/ISSUE_TEMPLATE/bug.yml: label triage isn't in .github/labels.json",
    ));
  it("fails without the bug form", () =>
    expect(labels.run(ctx(tmpDir({ ".github/labels.json": JSON.stringify({ labels: allLabels }) }))).out).toBe("no .github/ISSUE_TEMPLATE/bug.yml"));
  it("the bug form files with the bug label", () => expect(readFileSync("../../.github/ISSUE_TEMPLATE/bug.yml", "utf8")).toMatch(/^labels: \[bug\]$/m));
});

describe("github/in-step", () => {
  const yml = readFileSync("../../.github/workflows/in-step.yml", "utf8");
  it("passes on the repo's own workflow", () => expect(inStep.run(ctx(process.cwd() + "/../..")).status).toBe("pass"));
  it("fails on a workflow that doesn't run again on an edit", () =>
    expect(inStep.run(ctx(tmpDir({ [IN_STEP_WORKFLOW]: yml.replace("edited, ", "") }))).detail).toBe("doesn't run when the PR description is edited"));
  it("fails without the workflow", () => expect(inStep.run(ctx(tmpDir())).status).toBe("fail"));
});

describe("github/pages", () => {
  const wf = (name: string) => readFileSync(`../../.github/workflows/${name}`, "utf8");
  const repo = { [SITE_WORKFLOW]: wf("deploy-pages.yml"), ".github/workflows/pr-preview.yml": wf("pr-preview.yml"), ".github/workflows/pr-cleanup.yml": wf("pr-cleanup.yml") };
  it("passes on the repo's own workflows", () => expect(pages.run(ctx(process.cwd() + "/../.."))).toMatchObject({ status: "pass", detail: "3 workflows" }));
  it("passes on copies of them", () => expect(pages.run(ctx(tmpDir(repo))).status).toBe("pass"));
  it("fails when a preview shares the site's group (#47)", () =>
    expect(pages.run(ctx(tmpDir({ ...repo, ".github/workflows/pr-preview.yml": wf("pr-preview.yml").replace(/group: .*/, "group: gh-pages-site") }))).out).toBe(
      ".github/workflows/pr-preview.yml: shares the site's concurrency group gh-pages-site, so it can cancel main's deploy",
    ));
  it("fails when the deploy action force-pushes", () =>
    expect(pages.run(ctx(tmpDir({ ...repo, [SITE_WORKFLOW]: wf("deploy-pages.yml").replace(/^\s*force: false\n/m, "") }))).out).toMatch(/deploy-pages.yml: the deploy action force-pushes/));
  it("fails when the cleanup gives up on a rejected push", () =>
    expect(pages.run(ctx(tmpDir({ ...repo, ".github/workflows/pr-cleanup.yml": "jobs:\n  c:\n    steps:\n      - with:\n          ref: gh-pages\n      - run: git push\nconcurrency:\n  group: x\n" }))).out).toBe(
      ".github/workflows/pr-cleanup.yml: pushes to gh-pages and gives up, or overwrites, when the push is rejected",
    ));
  it("fails on a push to gh-pages with no queue", () =>
    expect(pages.run(ctx(tmpDir({ ...repo, ".github/workflows/pr-cleanup.yml": wf("pr-cleanup.yml").replace(/^concurrency:\n  group: .*\n/m, "") }))).out).toBe(
      ".github/workflows/pr-cleanup.yml: pushes to gh-pages with no concurrency group",
    ));
  it("fails without the site's workflow", () => expect(pages.run(ctx(tmpDir())).detail).toBe(`no ${SITE_WORKFLOW}`));
});
