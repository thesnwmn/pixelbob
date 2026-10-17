import { describe, expect, it } from "vitest";
import { type Check, pass, fail } from "../src/check.ts";
import { CHECKS, runChecks } from "../src/run.ts";
import { ctx, tmpDir } from "./fixture.ts";

const check = (id: string, tier: number, result = pass(), extra: Partial<Check> = {}): Check => ({ id, tier, repro: "", hint: "", run: () => result, ...extra });

describe("runChecks", () => {
  const c = ctx(tmpDir());
  it("stops at the first tier that fails", () => {
    const report = runChecks([check("a/1", 1), check("b/1", 2, fail("no")), check("b/2", 2), check("c/1", 3)], c, { quick: false, end: false });
    expect(report.ok).toBe(false);
    expect(report.stoppedAt).toBe(2);
    expect(report.results.map((r) => r.id)).toEqual(["a/1", "b/1", "b/2"]);
  });
  it("skips slow checks on --quick and end checks without --end", () => {
    const report = runChecks([check("a/slow", 1, fail("x"), { slow: true }), check("a/end", 1, fail("x"), { end: true })], c, { quick: true, end: false });
    expect(report.ok).toBe(true);
    expect(report.results.map((r) => r.status)).toEqual(["skip", "skip"]);
  });
  it("turns a check that throws into a failure", () => {
    const boom = check("a/boom", 1, pass(), { run: () => { throw new Error("boom"); } });
    expect(runChecks([boom], c, { quick: false, end: false }).results[0].status).toBe("fail");
  });
  it("has unique ids, each in its tier", () => {
    expect(new Set(CHECKS.map((k) => k.id)).size).toBe(CHECKS.length);
    const tiers = { tools: 1, deps: 2, repo: 3, code: 4, studio: 5, docs: 5, github: 5 } as Record<string, number>;
    for (const k of CHECKS) expect(k.tier).toBe(tiers[k.id.split("/")[0]]);
  });
});
