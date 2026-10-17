import { describe, expect, it } from "vitest";
import { git, node, pnpm } from "../src/tools.ts";
import { ctx, fakeShell, tmpDir } from "./fixture.ts";

describe("tools/node", () => {
  const root = tmpDir({ ".nvmrc": "22\n" });
  it("passes on the pinned major", () => expect(node.run(ctx(root)).status).toBe("pass"));
  it("fails on another major", () => expect(node.run(ctx(root, { node: "v20.11.0" })).status).toBe("fail"));
  it("fails on a 22 too old to strip types", () => expect(node.run(ctx(root, { node: "v22.12.0" })).status).toBe("fail"));
  it("fails without .nvmrc", () => expect(node.run(ctx(tmpDir())).status).toBe("fail"));
});

describe("tools/pnpm", () => {
  const root = tmpDir({ "package.json": JSON.stringify({ packageManager: "pnpm@10.28.0" }) });
  const at = (v: string) => ctx(root, { sh: fakeShell({ "pnpm --version": { out: `${v}\n` } }) });
  it("passes on packageManager's version", () => expect(pnpm.run(at("10.28.0")).status).toBe("pass"));
  it("fails on another version", () => expect(pnpm.run(at("9.15.0")).status).toBe("fail"));
  it("fails when pnpm is missing", () => expect(pnpm.run(ctx(root, { sh: fakeShell({}) })).status).toBe("fail"));
});

describe("tools/git", () => {
  const ok = { "git --version": { out: "git version 2.43.0\n" }, "git rev-parse --is-inside-work-tree": { out: "true\n" } };
  it("passes in a checkout", () => expect(git.run(ctx(tmpDir(), { sh: fakeShell(ok) })).detail).toBe("2.43.0"));
  it("fails when git is missing", () => expect(git.run(ctx(tmpDir(), { sh: fakeShell({}) })).status).toBe("fail"));
  it("fails outside a checkout", () => expect(git.run(ctx(tmpDir())).status).toBe("fail"));
});
