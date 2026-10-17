import { describe, expect, it } from "vitest";
import { install, resolve } from "../src/deps.ts";
import { ctx, fakeShell, tmpDir } from "./fixture.ts";

describe("deps/install", () => {
  const cmd = "pnpm install --frozen-lockfile --prefer-offline";
  it("passes when the lockfile installs", () => expect(install.run(ctx(tmpDir(), { sh: fakeShell({ [cmd]: {} }) })).status).toBe("pass"));
  it("fails when it doesn't", () => {
    const r = install.run(ctx(tmpDir(), { sh: fakeShell({ [cmd]: { code: 1, out: "ERR_PNPM_OUTDATED_LOCKFILE" } }) }));
    expect(r.status).toBe("fail");
    expect(r.out).toContain("OUTDATED");
  });
});

describe("deps/resolve", () => {
  const files = {
    "package.json": JSON.stringify({ devDependencies: { vitest: "1" } }),
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - concept\n",
    "packages/a/package.json": JSON.stringify({ dependencies: { "@x/b": "workspace:*" } }),
    "concept/package.json": JSON.stringify({}),
    "node_modules/vitest/package.json": "{}",
  };
  it("passes when every package finds its dependencies", () => {
    const root = tmpDir({ ...files, "packages/a/node_modules/@x/b/package.json": "{}" });
    expect(resolve.run(ctx(root))).toEqual({ status: "pass", detail: "3 packages" });
  });
  it("fails when one is missing", () => {
    const r = resolve.run(ctx(tmpDir(files)));
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("packages/a: @x/b");
  });
});
