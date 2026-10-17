// Runs the checks tier by tier and reports. A tier that fails stops the run: there's
// no point type-checking without dependencies. See studio/README.md#health.
import { type Check, type Ctx, type Result, type Status, realShell } from "./check.ts";
import { CODE } from "./code.ts";
import { DEPS } from "./deps.ts";
import { REPO } from "./repo.ts";
import { STUDIO } from "./studio.ts";
import { TOOLS } from "./tools.ts";

export const CHECKS: Check[] = [...TOOLS, ...DEPS, ...REPO, ...CODE, ...STUDIO];

export interface Options {
  /** Skip the slow checks (the site build), for use while working. */
  quick: boolean;
  /** Add the end-of-session checks: tree clean, everything pushed. */
  end: boolean;
}

export interface Ran extends Result {
  id: string;
  tier: number;
  ms: number;
  repro: string;
  hint: string;
}

export interface Report {
  ok: boolean;
  options: Options;
  /** The tier that failed and stopped the run, if any. */
  stoppedAt?: number;
  results: Ran[];
  ms: number;
}

export function runChecks(checks: Check[], ctx: Ctx, options: Options, onResult?: (r: Ran) => void): Report {
  const start = performance.now();
  const results: Ran[] = [];
  let stoppedAt: number | undefined;
  const tiers = [...new Set(checks.map((c) => c.tier))].sort((a, b) => a - b);
  for (const tier of tiers) {
    for (const check of checks.filter((c) => c.tier === tier)) {
      const t0 = performance.now();
      let result: Result;
      if (check.end && !options.end) result = { status: "skip", detail: "end of session only (--end)" };
      else if (check.slow && options.quick) result = { status: "skip", detail: "slow (--quick)" };
      else {
        try {
          result = check.run(ctx);
        } catch (e) {
          result = { status: "fail", detail: "the check threw", out: String((e as Error).stack ?? e) };
        }
      }
      const ran = { id: check.id, tier, ...result, ms: Math.round(performance.now() - t0), repro: check.repro, hint: check.hint };
      results.push(ran);
      onResult?.(ran);
    }
    if (results.some((r) => r.tier === tier && r.status === "fail")) {
      stoppedAt = tier;
      break;
    }
  }
  return { ok: stoppedAt === undefined, options, stoppedAt, results, ms: Math.round(performance.now() - start) };
}

const MARK: Record<Status, string> = { pass: "✓", warn: "!", fail: "✗", skip: "-" };
const secs = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

export const formatLine = (r: Ran): string =>
  `  ${MARK[r.status]} ${r.id.padEnd(22)} ${(r.detail ?? "").padEnd(44)} ${secs(r.ms).padStart(6)}`;

export function formatSummary(report: Report): string {
  const lines: string[] = [];
  for (const r of report.results.filter((r) => r.status === "fail")) {
    lines.push("", `✗ ${r.id}: ${r.detail ?? "failed"}`, `  run:  ${r.repro}`, `  hint: ${r.hint}`);
    if (r.out) lines.push(...r.out.trimEnd().split("\n").map((l) => `  │ ${l}`));
  }
  const count = (s: Status) => report.results.filter((r) => r.status === s).length;
  const tally = [`${count("pass")} passed`, count("warn") && `${count("warn")} warning(s)`, count("fail") && `${count("fail")} failed`, count("skip") && `${count("skip")} skipped`]
    .filter(Boolean)
    .join(", ");
  const verdict = report.ok ? "healthy" : `unhealthy: stopped at tier ${report.stoppedAt}`;
  lines.push("", `${verdict} (${tally}) in ${secs(report.ms)}`);
  return lines.join("\n");
}

export function main(argv: string[], root: string): number {
  const options: Options = { quick: argv.includes("--quick"), end: argv.includes("--end") };
  const json = argv.includes("--json");
  const ctx: Ctx = { root, node: process.version, env: process.env, sh: realShell(root) };
  const mode = [options.quick && "quick", options.end && "end of session"].filter(Boolean).join(", ");
  if (!json) console.log(`pnpm health${mode ? ` (${mode})` : ""}`);
  const report = runChecks(CHECKS, ctx, options, json ? undefined : (r) => console.log(formatLine(r)));
  console.log(json ? JSON.stringify(report, null, 2) : formatSummary(report));
  return report.ok ? 0 : 1;
}
