// Broken (and healthy) fixtures for the checks: a temp dir with files, and a fake shell.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Ctx, type Shell, realShell } from "../src/check.ts";

/** A temp dir holding `files` (path → contents). */
export function tmpDir(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "health-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** A temp git repo on `branch` holding `files`, committed. */
export function tmpRepo(files: Record<string, string>, branch = "work"): string {
  const root = tmpDir(files);
  const git = realShell(root);
  for (const args of [
    ["init", "-q", "-b", branch],
    ["add", "-A"],
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"],
  ]) {
    const r = git("git", args);
    if (r.code !== 0) throw new Error(r.out);
  }
  return root;
}

/** Answers `cmd args…` from `replies`; anything else exits 127. */
export function fakeShell(replies: Record<string, { code?: number; out?: string }>): Shell {
  return (cmd, args) => {
    const r = replies[[cmd, ...args].join(" ")];
    return r ? { code: r.code ?? 0, out: r.out ?? "" } : { code: 127, out: `not faked: ${cmd} ${args.join(" ")}` };
  };
}

export const ctx = (root: string, over: Partial<Ctx> = {}): Ctx => ({ root, node: "v22.22.0", env: {}, sh: realShell(root), ...over });

/** Seven of `c`: conflict markers built at runtime, so this file never holds one. */
export const marker = (c: string) => c.repeat(7);
