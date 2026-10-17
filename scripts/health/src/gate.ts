// The gate's logic, which the gate workflow runs as
// `node scripts/health/src/gate.ts <changed-files.txt> '<labels as JSON>'` and which prints
// its verdict as JSON. Only node: imports, so nothing ungated can change what it decides.
// What's gated is .github/gated.json; why, docs/decisions/2026-10-17-gated-files.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Gated {
  /** A file, or a folder when it ends in "/". */
  path: string;
  why: string;
}

/** The changed files a gate rule covers, each with why. */
export const gatedHits = (rules: Gated[], files: string[]): string[] =>
  files.flatMap((f) => {
    const rule = rules.find((r) => (r.path.endsWith("/") ? f.startsWith(r.path) : f === r.path));
    return rule ? [`${f} (${rule.why})`] : [];
  });

export interface Verdict {
  hits: string[];
  /** Put the `gated` label on: gated files and no label yet. It's never taken off here. */
  label: boolean;
  /** Not gated, or the producer has let it through. */
  pass: boolean;
}

/** A PR is gated by its files or by the `gated` label (put on by hand, say for Bob's character); `producer-ok` lets it through. */
export function verdict(hits: string[], labels: string[]): Verdict {
  const gated = hits.length > 0 || labels.includes("gated");
  return { hits, label: hits.length > 0 && !labels.includes("gated"), pass: !gated || labels.includes("producer-ok") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const rules: Gated[] = JSON.parse(readFileSync(join(root, ".github/gated.json"), "utf8")).gated;
  const files = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
  console.log(JSON.stringify(verdict(gatedHits(rules, files), JSON.parse(process.argv[3] ?? "[]"))));
}
