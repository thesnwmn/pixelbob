// What a check is, what it's given, and the helpers the checks share. Every check is
// a function of its context, so a test can hand it a broken fixture (a temp dir, a
// fake shell) and expect it to fail.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Status = "pass" | "warn" | "fail" | "skip";

export interface Result {
  status: Status;
  /** One line for the report: a version, a count, what's wrong. */
  detail?: string;
  /** Command output worth showing under a failure. */
  out?: string;
}

export interface Shell {
  (cmd: string, args: string[]): { code: number; out: string };
}

export interface Ctx {
  root: string;
  /** `process.version`, e.g. "v22.22.0". */
  node: string;
  env: Record<string, string | undefined>;
  sh: Shell;
}

export interface Check {
  /** `tier/name`, e.g. "tools/node". */
  id: string;
  tier: number;
  /** Skipped by `--quick`. */
  slow?: boolean;
  /** Only run by `--end`: the end-of-session checks. */
  end?: boolean;
  /** The command that reproduces a failure. */
  repro: string;
  /** The usual cause of a failure, and the usual fix. */
  hint: string;
  run(ctx: Ctx): Result;
}

export const pass = (detail?: string): Result => ({ status: "pass", detail });
export const warn = (detail: string): Result => ({ status: "warn", detail });
export const fail = (detail: string, out?: string): Result => ({ status: "fail", detail, out });
export const skip = (detail: string): Result => ({ status: "skip", detail });

export function realShell(root: string): Shell {
  // `pnpm -s health` would otherwise silence the pnpm runs whose output a failure shows.
  const { npm_config_loglevel: _, ...env } = process.env;
  return (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: root, env, encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.error) return { code: 127, out: String(r.error.message) };
    return { code: r.status ?? 1, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
}

export const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

/** Running in CI (GitHub Actions sets both). */
export const inCI = (env: Ctx["env"]): boolean => env.CI === "true" || env.GITHUB_ACTIONS === "true";

/** Workspace package dirs from `pnpm-workspace.yaml`: `dir/*` globs and plain dirs. */
export function workspaceDirs(root: string): string[] {
  const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const dirs: string[] = [];
  for (const m of yaml.matchAll(/^\s*-\s*["']?([^"'\s#]+)["']?/gm)) {
    const pattern = m[1];
    if (pattern.endsWith("/*")) {
      const parent = join(root, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const name of readdirSync(parent).sort()) {
        if (existsSync(join(parent, name, "package.json"))) dirs.push(join(pattern.slice(0, -2), name));
      }
    } else if (existsSync(join(root, pattern, "package.json"))) {
      dirs.push(pattern);
    }
  }
  return dirs;
}

/** Every file under `dir` (relative to root) with one of `exts`, skipping node_modules and dist. */
/** The source files under `dir`, or `dir` itself if it's a file. */
export function sourceFiles(root: string, dir: string, exts = [".ts", ".mjs", ".js"]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (!statSync(abs).isDirectory()) {
      out.push(rel);
      return;
    }
    for (const name of readdirSync(abs).sort()) {
      if (name === "node_modules" || name === "dist") continue;
      const child = join(rel, name);
      if (statSync(join(root, child)).isDirectory()) walk(child);
      else if (exts.some((e) => name.endsWith(e))) out.push(child);
    }
  };
  walk(dir);
  return out;
}

/** Source with comments blanked, keeping line numbers. Naive about `//` inside strings, which only hides code. */
export const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");

/** `file:line: text` for every line of code (comments ignored) matching `re`. */
export function findInCode(root: string, files: string[], re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(join(root, file), "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

/** The last `n` lines of command output, for the report. */
export const tail = (out: string, n = 30): string => out.trimEnd().split("\n").slice(-n).join("\n");
