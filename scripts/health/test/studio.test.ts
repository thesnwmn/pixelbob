import { describe, expect, it } from "vitest";
import { board, loadStudio, parseFrontMatter } from "../../../studio/board.ts";
import { ROLES } from "../../../studio/board.ts";
import { page } from "../../../studio/page.ts";
import { anchors, commands, docsIndex, files, flying, guideCommands, landed, links, pageProblems, roles, slugify, studioPage, tableRoles } from "../src/studio.ts";
import { ctx, tmpDir, tmpRepo } from "./fixture.ts";

const unit = (fields: string, body = "## Why\nBecause.\n\n## Done when\n- It works.\n\n## Not this\nThe rest.\n") => `---\n${fields}\n---\n\n${body}`;

/** A studio that follows every format: overridden or added to by `files`. */
const studio = (files: Record<string, string | null> = {}): Record<string, string> => {
  const all: Record<string, string | null> = {
    "studio/producer.md": "---\nautonomy: studio-merges\n---\n",
    "studio/direction.md": "---\nmilestone: m1\n---\n",
    "studio/milestones/m1.md": "---\ntitle: One\nstatus: current\n---\n\n## Why\nW.\n\n## Scope\nS.\n\n## Exit criteria\nE.\n",
    "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: S\nstatus: ready\nmilestone: m1"),
    "studio/work/split.md": unit("title: Split\nkind: build\nrole: engineer\nsize: M\nstatus: shaped\nmilestone: m1\nneeds: [jump, split-direction]"),
    "studio/asks/split-direction.md": "---\ntitle: Which way?\nfrom: designer\nstatus: open\nblocks: [split]\ndefault: Across.\nexpires: after 3 sessions\ngated: false\n---\nContext.\n",
    "studio/sessions/2026-10-17-0900-start.md": "---\ndate: 2026-10-17\ncommand: /go\nunits: [jump]\npr: 8, 9\n---\n",
    ...files,
  };
  return Object.fromEntries(Object.entries(all).filter((e): e is [string, string] => e[1] !== null));
};

const problems = (over: Record<string, string | null>) => loadStudio(tmpDir(studio(over))).problems;

describe("front matter", () => {
  it("reads text, numbers, booleans and lists, and drops comments", () => {
    expect(parseFrontMatter("---\ntitle: A thing  # note\npr: 41\ngated: false\nneeds: [a, b]\nnone: []\n---\nbody")).toEqual({
      fields: { title: "A thing", pr: 41, gated: false, needs: ["a", "b"], none: [] },
      body: "body",
    });
  });
  it("is undefined without a block at the top", () => expect(parseFrontMatter("# Title\n")).toBeUndefined());
  it("throws on a line it can't read", () => expect(() => parseFrontMatter("---\njust words\n---\n")).toThrow(/just words/));
});

describe("studio/files", () => {
  it("passes on a studio that follows its formats", () => {
    const r = files.run(ctx(tmpDir(studio())));
    expect(r.status).toBe("pass");
    expect(r.detail).toBe("2 units, 1 asks, 1 milestones, 1 sessions");
  });
  it("fails without the producer's file", () => expect(files.run(ctx(tmpDir(studio({ "studio/producer.md": null })))).status).toBe("fail"));
  it("fails on a status that doesn't exist", () =>
    expect(problems({ "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: S\nstatus: started") })).toEqual(['studio/work/jump.md: status is "started", not one of idea | shaped | ready | doing | review | playtest | done | dropped']));
  it("fails on a unit too big to start", () => expect(problems({ "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: L\nstatus: ready") })[0]).toMatch(/size is "L"/));
  it("fails on a shaped unit without Done when", () =>
    expect(problems({ "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: S\nstatus: ready", "## Why\nW.\n\n## Not this\nN.\n") })).toEqual(['studio/work/jump.md: ready, so it needs "## Done when"']));
  it("fails on a done unit with no PR or log", () =>
    expect(problems({ "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: S\nstatus: done") })).toEqual(["studio/work/jump.md: missing pr", 'studio/work/jump.md: done, so its "## Log" says why']));
  it("fails on a need that doesn't exist", () =>
    expect(problems({ "studio/work/split.md": unit("title: Split\nkind: build\nrole: engineer\nsize: M\nstatus: shaped\nneeds: [jump, split-direction, wings]") })).toContain('studio/work/split.md: needs "wings", which is no unit or ask'));
  it("fails on a ready unit whose needs are open", () =>
    expect(problems({ "studio/work/split.md": unit("title: Split\nkind: build\nrole: engineer\nsize: M\nstatus: ready\nneeds: [jump, split-direction]") })).toEqual([
      'studio/work/split.md: ready, but "jump" is still open',
      'studio/work/split.md: ready, but "split-direction" is still open',
    ]));
  it("fails on an ask whose unit doesn't list it", () =>
    expect(problems({ "studio/work/split.md": unit("title: Split\nkind: build\nrole: engineer\nsize: M\nstatus: shaped\nneeds: [jump]") })).toEqual([
      "studio/asks/split-direction.md: blocks \"split\", but studio/work/split.md doesn't list it in needs",
    ]));
  it("fails on an open ask that blocks nothing", () =>
    expect(problems({ "studio/asks/split-direction.md": "---\ntitle: Q\nfrom: designer\nstatus: open\ndefault: D.\nexpires: soon\ngated: false\n---\n" })).toEqual([
      "studio/asks/split-direction.md: missing blocks",
      "studio/asks/split-direction.md: an open ask names what it blocks",
    ]));
  it("fails on a direction whose milestone isn't current", () =>
    expect(problems({ "studio/milestones/m1.md": "---\ntitle: One\nstatus: done\n---\n\n## Why\nW.\n\n## Scope\nS.\n\n## Exit criteria\nE.\n" })).toEqual(['studio/direction.md: milestone "m1" is done, not current']));
  it("fails on a session log named for another day", () =>
    expect(problems({ "studio/sessions/2026-10-17-0900-start.md": "---\ndate: 2026-10-18\ncommand: /go\n---\n" })).toEqual(["studio/sessions/2026-10-17-0900-start.md: the file name should start with its date, 2026-10-18"]));
  it("fails on a session log without its time, or with one that isn't a time", () => {
    for (const name of ["2026-10-17-start", "2026-10-17-2460-start", "2026-10-17-0900"])
      expect(problems({ [`studio/sessions/${name}.md`]: "---\ndate: 2026-10-17\ncommand: /go\n---\n" })).toContain(`studio/sessions/${name}.md: the file name should be 2026-10-17-HHMM-<slug>, with the UTC time it was written`);
  });
  it("reads a playtest report, and fails on a rating out of range", () => {
    const report = (fun: number) => `---\ndate: 2026-10-21\nby: producer\nbuild: preview/pr-41\nunits: [jump]\nfun: ${fun}\ndifficulty: right\nfrustration: 2\n---\n`;
    expect(problems({ "studio/playtests/2026-10-21-jump.md": report(4) })).toEqual([]);
    expect(problems({ "studio/playtests/2026-10-21-jump.md": report(7) })).toEqual(["studio/playtests/2026-10-21-jump.md: fun is 7, not 1 to 5"]);
  });
  it("fails on a file with no front matter", () => expect(problems({ "studio/work/note.md": "# A note\n" })).toEqual(["studio/work/note.md: no front matter (--- … --- at the top)"]));
});

describe("the board", () => {
  it("lists what needs the producer and what's ready", () => {
    const text = board(loadStudio(tmpDir(studio())));
    expect(text).toContain("- Ask **split-direction**: Which way? Default: Across. Blocks split. Expires after 3 sessions.");
    expect(text).toMatch(/## Ready\n\n- \*\*jump\*\*: Jump \(build, S, engineer\)/);
    expect(text).toContain("- **m1** (current): One. 0/2 units done.");
  });
});

const doing = { "studio/work/jump.md": unit("title: Jump\nkind: build\nrole: engineer\nsize: S\nstatus: doing\nmilestone: m1\npr: 41") };

describe("studio/in-flight", () => {
  it("passes a unit in flight on a session's branch", () => expect(flying.run(ctx(tmpRepo(studio(doing), "work")))).toMatchObject({ status: "pass", detail: "jump (doing)" }));
  it("fails one on main", () => expect(flying.run(ctx(tmpRepo(studio(doing), "main"))).status).toBe("fail"));
});

describe("studio/landed", () => {
  it("passes when nothing is doing", () => expect(landed.run(ctx(tmpDir(studio()))).status).toBe("pass"));
  it("fails when the session's unit is still doing", () => expect(landed.run(ctx(tmpDir(studio(doing))))).toMatchObject({ status: "fail", detail: "still doing: jump" }));
});

describe("docs/index", () => {
  const docs = { "docs/README.md": "| [Bob](bob.md) | him |\n[PR titles](decisions/2026-10-17-pr-titles.md)\n", "docs/bob.md": "# Bob\n", "docs/decisions/2026-10-17-pr-titles.md": "# PR titles\n" };
  it("passes when every doc is listed", () => expect(docsIndex.run(ctx(tmpRepo(docs))).status).toBe("pass"));
  it("fails on a doc that isn't", () => expect(docsIndex.run(ctx(tmpRepo({ ...docs, "docs/worlds.md": "# Worlds\n" })))).toMatchObject({ status: "fail", detail: "not in docs/README.md: docs/worlds.md" }));
});

describe("docs/links", () => {
  it("makes anchors the way GitHub does", () => {
    expect(slugify("What `/go` picks")).toBe("what-go-picks");
    expect(slugify("The studio's state")).toBe("the-studios-state");
    expect(slugify("Phase 2½: concept (`concept/`)")).toBe("phase-2½-concept-concept");
    expect([...anchors("# A\n## Log\n```\n# not a heading\n```\n## Log\n")]).toEqual(["a", "log", "log-1"]);
  });
  const docs = {
    "docs/a.md": "# A\n\n## Still to settle\n\nSee [b](b.md#why), [settle](#still-to-settle), [site](https://example.com) and `[code](nowhere.md)`.\n",
    "docs/b.md": "# B\n\n## Why\n",
  };
  it("passes when every link resolves", () => expect(links.run(ctx(tmpRepo(docs)))).toMatchObject({ status: "pass", detail: "2 files" }));
  it("fails on a missing file and a missing heading", () => {
    const r = links.run(ctx(tmpRepo({ ...docs, "docs/c.md": "[gone](gone.md), [moved](a.md#what-we-want-to-settle)\n" })));
    expect(r.status).toBe("fail");
    expect(r.out).toBe("docs/c.md: gone.md (no such file)\ndocs/c.md: a.md#what-we-want-to-settle (no such heading)");
  });
});

const brief = (name: string) => `---\nname: ${name}\ndescription: Does ${name} things.\n---\n\nYou are ${name}.\n`;
const table = (names: string[]) => `# The studio\n\n## The roles\n\n| Role | Does |\n|---|---|\n${names.map((n) => `| **${n}** | things |`).join("\n")}\n\n## Invocation\n\n| **Not a role** | x |\n`;
const titled = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const allRoles = () => ({ "studio/README.md": table(ROLES.map(titled)), ...Object.fromEntries(ROLES.map((r) => [`.claude/agents/${r}.md`, brief(r)])) });

describe("studio/roles", () => {
  it("reads the roles table as slugs", () => expect(tableRoles(table(["Director", "Art director"]))).toEqual(["director", "art-director"]));
  it("passes when briefs, table and ROLES agree", () => expect(roles.run(ctx(tmpDir(allRoles())))).toMatchObject({ status: "pass", detail: `${ROLES.length} roles` }));
  it("fails on a role with no brief", () => {
    const files: Record<string, string> = allRoles();
    delete files[".claude/agents/muse.md"];
    expect(roles.run(ctx(tmpDir(files))).out).toBe("muse: in the roles table, but no .claude/agents/muse.md");
  });
  it("fails on a brief that isn't in the table, and one misnamed", () => {
    const r = roles.run(ctx(tmpDir({ ...allRoles(), ".claude/agents/audio.md": brief("audio"), ".claude/agents/critic.md": brief("reviewer") })));
    expect(r.out).toBe(["audio: has a brief, but isn't in the roles table", '.claude/agents/critic.md: name should be "critic"'].join("\n"));
  });
});

describe("studio/commands", () => {
  const guide = "# Producer guide\n\n### `/go`\n\n### `/director <anything>`\n";
  const skills = { "studio/producer-guide.md": guide, ".claude/skills/go/SKILL.md": brief("go"), ".claude/skills/director/SKILL.md": brief("director") };
  it("reads the commands from the guide's headings", () => expect(guideCommands(guide)).toEqual(["go", "director"]));
  it("passes when the skills and the guide agree", () => expect(commands.run(ctx(tmpDir(skills)))).toMatchObject({ status: "pass", detail: "2 commands" }));
  it("fails on a command with no skill, and a skill not in the guide", () => {
    const r = commands.run(ctx(tmpDir({ ...skills, "studio/producer-guide.md": guide + "\n### `/status`\n", ".claude/skills/secret/SKILL.md": brief("secret") })));
    expect(r.out).toBe(["/status: in the producer guide, but no .claude/skills/status/SKILL.md", "/secret: a skill, but not in the producer guide"].join("\n"));
  });
  it("fails on a skill named like one of Claude Code's own commands", () => {
    const r = commands.run(ctx(tmpDir({ ...skills, "studio/producer-guide.md": guide + "\n### `/feedback`\n", ".claude/skills/feedback/SKILL.md": brief("feedback") })));
    expect(r.out).toBe("/feedback: Claude Code has its own /feedback, which runs instead of the skill: rename it");
  });
});

describe("studio/page", () => {
  it("passes on a studio it can show", () => expect(studioPage.run(ctx(tmpDir(studio())))).toEqual({ status: "pass", detail: "2 units" }));
  it("fails on Markdown it doesn't convert", () => {
    const r = studioPage.run(ctx(tmpDir(studio({ "studio/work/jump.md": unit("title: **Jump\nkind: build\nrole: engineer\nsize: S\nstatus: ready\nmilestone: m1") }))));
    expect(r.status).toBe("fail");
    expect(r.out).toMatch(/^left as Markdown: .*\*\*Jump/);
  });
  it("fails on a unit it doesn't show", () => expect(pageProblems("<li><b>jump</b></li>", ["jump", "split"])).toEqual(["split: not on the page"]));
  it("shows the board, its links on GitHub, and the sessions with their PRs", () => {
    const html = page(loadStudio(tmpDir(studio())), undefined, new Date("2026-10-17T12:00:00Z"));
    expect(html).toContain("<li><b>jump</b>: Jump (build, S, engineer)</li>");
    expect(html).toContain('<a href="https://github.com/thesnwmn/pixelbob/blob/main/studio/README.md#the-studios-state">');
    expect(html).toContain("on 2026-10-17 12:00 UTC");
    expect(html).toContain('<a href="https://github.com/thesnwmn/pixelbob/pull/8">#8</a> <a href="https://github.com/thesnwmn/pixelbob/pull/9">#9</a>');
  });
  it("never links a PR or issue title anywhere but https, and escapes it", () => {
    const github = { prs: [], issues: [{ number: 3, title: '[click](javascript:alert(1)) <img src=x onerror=alert(1)> [ok](https://example.com)', labels: [] }] };
    const html = page(loadStudio(tmpDir(studio())), github);
    expect(html).not.toMatch(/javascript:|<img/);
    expect(html).toContain('<li>#3: click) &lt;img src=x onerror=alert(1)&gt; <a href="https://example.com">ok</a></li>');
  });
});
