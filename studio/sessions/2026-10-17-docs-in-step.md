---
date: 2026-10-17
command: /go
units: [docs-in-step]
pr: 14
issues: []
session: https://claude.ai/code/session_01P7LSCfE47ctpanCnT2yPvp
health: green at start; green at end
size: S planned; a small share of the context, no compaction
---

## Summary
Health was green and nothing was waiting on the producer, so `/go` took the riskier of the two ready units left in m0-studio, docs-in-step. Until now nothing checked that a change brought its docs, its unit and its session log with it.

## The producer said
- `/go`, with no arguments.

## Done
- `studio/doc-map.json`: which docs describe which code. A changed file belongs to the first entry it matches; any one of an entry's docs counts.
- `scripts/health/src/instep.ts`: three checks on a branch against main, `docs/in-step`, `studio/unit` and `studio/session-log`, each excused by its line in the PR description (`Docs: none needed, because …` and so on, with a real reason; the template's comments and a bare `…` don't count). And `docs/map` in `studio.ts`: every path in the map matches a file, every doc and heading exists.
- The `in-step` workflow runs the same logic on every PR, again whenever the description is edited, and fails the PR.
- `github/in-step`: the workflow exists, runs `instep.ts`, and runs again on an edit.
- Tests for each, with broken fixtures. The studio README, the producer guide's setup and the one-time-setup ask name the new check.

## Tried and dropped
- **Failing in `pnpm health`, in CI and at `--end`.** The description is written last, so a session would be red from its claim to its ship step, and `--end` can't be told apart from `--quick` without changing `run.ts`, which is gated. And CI's `pnpm health` doesn't run again when only the description changes. So in a session the checks warn, CI's health run skips them, and the `in-step` workflow, which runs on `edited`, is what fails the PR (like `pr-title`).

- **Making these checks fail at `--end`** (the Critic's suggestion, since the ruleset isn't on yet and the session's own end check is then the only real stop). It needs the runner to tell checks about `--end`, and the runner is gated; until the ruleset is on, a red `in-step` on the PR is what a session reads before merging.

## Learned
- In a `pull_request` checkout, `fetch-depth: 2` is enough: HEAD is the PR merged into its base, so `HEAD^1..HEAD` is exactly the PR.

## Left for next time
- **For the producer:** `instep.ts`, `in-step.yml` and the doc map aren't gated, so a PR could loosen its own check (the Critic's point). `ci.yml` and `gate.ts` are. Adding them to `.github/gated.json` is itself a gated change, so it's yours to ask for.
- `in-step` becomes a required check when the producer does the [one-time setup](../asks/one-time-setup.md).
- A `#heading` in the doc map says where to look, not which lines must change: any change to the file counts. Section-level matching could come later if it proves too loose.
- studio-page is the last ready unit in m0-studio.
