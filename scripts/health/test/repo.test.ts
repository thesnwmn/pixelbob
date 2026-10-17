import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realShell } from "../src/check.ts";
import { behind, branch, clean, conflicts, mappedFolders, pushed, repoMap } from "../src/repo.ts";
import { ctx, fakeShell, marker, tmpDir, tmpRepo } from "./fixture.ts";

describe("repo/branch", () => {
  const on = (name: string, env = {}) => ctx(tmpDir(), { env, sh: fakeShell({ "git branch --show-current": { out: `${name}\n` } }) });
  it("passes on a session branch", () => expect(branch.run(on("claude-xyz")).status).toBe("pass"));
  it("fails on main", () => expect(branch.run(on("main")).status).toBe("fail"));
  it("allows main in CI, which checks main itself", () => expect(branch.run(on("main", { CI: "true" })).status).toBe("pass"));
});

describe("repo/conflict-markers", () => {
  it("passes on a clean tree", () => expect(conflicts.run(ctx(tmpRepo({ "a.ts": "const a = 1;\n" }))).status).toBe("pass"));
  it("fails on a half-merged file", () => {
    const text = `${marker("<")} HEAD\nconst a = 1;\n${marker("=")}\nconst a = 2;\n${marker(">")} main\n`;
    const r = conflicts.run(ctx(tmpRepo({ "src/a.ts": text })));
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("in src/a.ts");
  });
});

describe("repo/map", () => {
  const readme = "# Studio\n\n## Repo structure\n\n```\npixelbob/\n  README.md   x\n  docs/       the game\n    img/      nested, not top level\n  .github/\n```\n";
  it("reads the top-level folders from the map", () => expect([...mappedFolders(readme)]).toEqual(["docs", ".github"]));
  it("passes when every folder is mapped", () => {
    const root = tmpRepo({ "studio/README.md": readme.replace("  .github/", "  studio/\n  .github/"), "docs/a.md": "", ".github/ci.yml": "" });
    expect(repoMap.run(ctx(root)).status).toBe("pass");
  });
  it("fails on a folder the map doesn't list", () => {
    const root = tmpRepo({ "studio/README.md": readme, "docs/a.md": "", "stray/b.ts": "" });
    const r = repoMap.run(ctx(root));
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("not in the map: stray, studio");
  });
});

describe("repo/behind-main", () => {
  const sh = (count: string) =>
    fakeShell({
      "git branch --show-current": { out: "work\n" },
      "git rev-parse --verify -q origin/main": {},
      "git rev-list --count HEAD..origin/main": { out: `${count}\n` },
    });
  it("passes when up to date", () => expect(behind.run(ctx(tmpDir(), { sh: sh("0") })).status).toBe("pass"));
  it("warns when main has moved on", () => expect(behind.run(ctx(tmpDir(), { sh: sh("3") }))).toEqual({ status: "warn", detail: "3 commits behind origin/main" }));
});

describe("repo/clean", () => {
  it("passes on a committed tree", () => expect(clean.run(ctx(tmpRepo({ "a.ts": "" }))).status).toBe("pass"));
  it("fails on uncommitted work", () => {
    const root = tmpRepo({ "a.ts": "" });
    writeFileSync(join(root, "b.ts"), "");
    expect(clean.run(ctx(root)).status).toBe("fail");
  });
});

describe("repo/pushed", () => {
  const withRemote = () => {
    const root = tmpRepo({ "a.ts": "" });
    const remote = tmpDir();
    const git = realShell(root);
    realShell(remote)("git", ["init", "-q", "--bare"]);
    git("git", ["remote", "add", "origin", remote]);
    git("git", ["push", "-q", "-u", "origin", "work"]);
    return { root, git };
  };
  it("passes when everything is pushed", () => expect(pushed.run(ctx(withRemote().root)).status).toBe("pass"));
  it("fails on a commit that isn't", () => {
    const { root, git } = withRemote();
    git("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "later"]);
    expect(pushed.run(ctx(root))).toEqual({ status: "fail", detail: "1 commit not pushed" });
  });
  it("fails with no upstream", () => expect(pushed.run(ctx(tmpRepo({ "a.ts": "" }))).detail).toBe("no upstream branch"));
});
