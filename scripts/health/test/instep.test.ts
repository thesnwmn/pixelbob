import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type DocMapEntry, type Pr, docsInStep, prProblems, docsProblems, excuse, globRe, sessionLog, sessionLogProblem, unit, unitProblem } from "../src/instep.ts";
import { docMap, docMapProblems } from "../src/studio.ts";
import { ctx, fakeShell, tmpDir, tmpRepo } from "./fixture.ts";

const map: DocMapEntry[] = [
  { paths: ["packages/sim/src/materials.ts"], docs: ["docs/materials.md"] },
  { paths: ["packages/sim/src/**"], docs: ["docs/simulation.md"] },
  { paths: ["prototypes/00-stills/src/kit/**"], docs: ["docs/art-direction.md", "concept/"] },
];
const pr = (paths: string[], body = "", status = "M"): Pr => ({ changes: paths.map((path) => ({ status, path })), body });
const template = readFileSync(join(import.meta.dirname, "../../../.github/pull_request_template.md"), "utf8");

describe("the doc map's globs", () => {
  it("* is a name, ** any path", () => {
    expect(globRe("packages/sim/src/**").test("packages/sim/src/a/b.ts")).toBe(true);
    expect(globRe("docs/*.md").test("docs/bob.md")).toBe(true);
    expect(globRe("docs/*.md").test("docs/decisions/x.md")).toBe(false);
    expect(globRe("scripts/build-site.mjs").test("scripts/build-siteXmjs")).toBe(false);
  });
});

describe("a reason in the PR description", () => {
  it("counts, bold or not", () => {
    expect(excuse("**Docs:** none needed, because it's a test-only change", "Docs", "none needed")).toBe("it's a test-only change");
    expect(excuse("Session log: none, because a one-line fix", "Session log", "none")).toBe("a one-line fix");
  });
  it("doesn't count in the template's comments, or as a bare …", () => {
    expect(excuse(template, "Session log", "none")).toBeUndefined();
    expect(excuse(template, "Docs", "none needed")).toBeUndefined();
    expect(excuse("**Docs:** none needed, because …", "Docs", "none needed")).toBeUndefined();
  });
});

describe("docs in step", () => {
  it("fails on code a doc describes, changed without the doc", () =>
    expect(docsProblems(map, pr(["packages/sim/src/world.ts", "packages/sim/src/generate.ts"]))).toEqual([
      "packages/sim/src/world.ts (and 1 more) changed, but not docs/simulation.md",
    ]));
  it("passes when the doc changed too", () => expect(docsProblems(map, pr(["packages/sim/src/world.ts", "docs/simulation.md"]))).toEqual([]));
  it("gives a file to the first entry it matches", () => {
    expect(docsProblems(map, pr(["packages/sim/src/materials.ts", "docs/simulation.md"]))).toEqual(["packages/sim/src/materials.ts changed, but not docs/materials.md"]);
    expect(docsProblems(map, pr(["packages/sim/src/materials.ts", "docs/materials.md"]))).toEqual([]);
  });
  it("takes any one of an entry's docs, a folder included", () => expect(docsProblems(map, pr(["prototypes/00-stills/src/kit/light.ts", "concept/src/main.ts"]))).toEqual([]));
  it("ignores what the map doesn't name", () => expect(docsProblems(map, pr(["packages/sim/test/world.test.ts", "README.md"]))).toEqual([]));
  it("passes with a reason", () => expect(docsProblems(map, pr(["packages/sim/src/world.ts"], "**Docs:** none needed, because it's a rename"))).toEqual([]));
});

describe("the unit", () => {
  it("fails on code changed with no unit", () => expect(unitProblem(pr(["packages/sim/src/world.ts"]))).toBe("packages/sim/src/world.ts changed, but no unit in studio/work/"));
  it("passes with a unit, a reason, or only studio files", () => {
    expect(unitProblem(pr(["packages/sim/src/world.ts", "studio/work/x.md"]))).toBeUndefined();
    expect(unitProblem(pr(["pnpm-lock.yaml"], "Unit: none, because a dependency bump"))).toBeUndefined();
    expect(unitProblem(pr(["studio/direction.md"]))).toBeUndefined();
  });
});

describe("the session log", () => {
  it("fails without a new log", () => {
    expect(sessionLogProblem(pr(["studio/work/x.md"]))).toBe("no new log in studio/sessions/");
    expect(sessionLogProblem(pr(["studio/sessions/old.md"]))).toBe("no new log in studio/sessions/");
  });
  it("passes with one, or a reason", () => {
    expect(sessionLogProblem({ changes: [{ status: "A", path: "studio/sessions/2026-10-17-0900-x.md" }], body: "" })).toBeUndefined();
    expect(sessionLogProblem(pr(["a.ts"], "**Session log:** none, because a /playtest session"))).toBeUndefined();
  });
});

describe("the checks on a branch", () => {
  const api = "gh api repos/o/r/pulls?head=o:work&state=open --jq .[0].body // \"\"";
  const sh = (diff: string, body = "") =>
    fakeShell({
      "git branch --show-current": { out: "work\n" },
      "git merge-base origin/main HEAD": { out: "base\n" },
      "git diff --name-status --no-renames base HEAD": { out: diff },
      "git remote get-url origin": { out: "https://github.com/o/r.git\n" },
      [api]: { out: body },
    });
  const root = tmpDir({ "studio/doc-map.json": JSON.stringify({ map }) });
  it("warn in a session, where the description comes last", () => {
    const c = ctx(root, { sh: sh("M\tpackages/sim/src/world.ts\n") });
    expect(docsInStep.run(c).status).toBe("warn");
    expect(unit.run(c).status).toBe("warn");
    expect(sessionLog.run(c).status).toBe("warn");
  });
  it("read the PR's description", () => {
    const body = "Docs: none needed, because x\nUnit: none, because y\nSession log: none, because z";
    const c = ctx(root, { sh: sh("M\tpackages/sim/src/world.ts\n", body) });
    expect([docsInStep, unit, sessionLog].map((k) => k.run(c).status)).toEqual(["pass", "pass", "pass"]);
  });
  it("leave CI to the in-step workflow", () =>
    expect([docsInStep, unit, sessionLog].map((k) => k.run(ctx(root, { env: { CI: "true" } })).status)).toEqual(["skip", "skip", "skip"]));
});

describe("the in-step workflow's verdict", () => {
  it("lists every problem with a PR", () =>
    expect(prProblems(map, pr(["packages/sim/src/world.ts"], "**Docs:** none needed, because …"))).toEqual([
      "packages/sim/src/world.ts changed, but not docs/simulation.md",
      "packages/sim/src/world.ts changed, but no unit in studio/work/",
      "no new log in studio/sessions/",
    ]));
  it("passes a PR in step", () =>
    expect(prProblems(map, { changes: [{ status: "M", path: "packages/sim/src/world.ts" }, { status: "M", path: "docs/simulation.md" }, { status: "M", path: "studio/work/x.md" }, { status: "A", path: "studio/sessions/s.md" }], body: "" })).toEqual([]));
});

describe("docs/map", () => {
  it("fails on a glob that matches nothing, and a doc or heading that doesn't exist", () => {
    const root = tmpDir({ "docs/a.md": "# A\n\n## Real\n" });
    const broken = [{ paths: ["gone/**"], docs: ["docs/a.md#real", "docs/a.md#fake", "docs/b.md", "concept/"] }];
    expect(docMapProblems(root, [null as never, { paths: "src/**" } as never], [])).toEqual(["an entry that isn't { paths: [...], docs: [...] }: null", 'an entry that isn\'t { paths: [...], docs: [...] }: {"paths":"src/**"}']);
    expect(docMapProblems(root, broken, ["docs/a.md"])).toEqual(["gone/**: matches no file", "docs/a.md#fake: no such heading", "docs/b.md: no such file", "concept/: no such folder"]);
  });
  it("fails without a map, and passes on a good one", () => {
    expect(docMap.run(ctx(tmpRepo({ "a.md": "" }))).status).toBe("fail");
    const good = tmpRepo({ "docs/a.md": "# A\n", "src/x.ts": "", "studio/doc-map.json": JSON.stringify({ map: [{ paths: ["src/**"], docs: ["docs/a.md#a"] }] }) });
    expect(docMap.run(ctx(good))).toEqual({ status: "pass", detail: "1 entry" });
  });
});
