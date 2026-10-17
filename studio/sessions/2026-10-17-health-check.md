---
date: 2026-10-17
command: /go (before the command existed; read as "build unit 1")
units: []
pr: 6
issues: []
session: https://claude.ai/code/session_01PwUVkCDdCPWGMZGNQvL8FN
health: no health check at start (this builds it); nothing installed at first; green at end
size: S planned; about a sixth of the context, no compaction
---

## Summary
Built unit 1 of [Building the studio](../README.md#building-the-studio): the [health check](../README.md#health). `pnpm health` runs tiers 1 to 4, there is a test for each check, a session start hook runs it, and CI runs it on PRs, on main and nightly.

## The producer said
- `/go`. The command isn't built yet (it comes with unit 3), so this session followed the plan: `/go` builds the next unit, and that's the health check.

## Done
- `scripts/health/`: one file per tier (`tools.ts`, `deps.ts`, `repo.ts`, `code.ts`), `run.ts` to run and report, and `health.mjs`, which explains a too-old Node before it tries to load `.ts`. It's a workspace package, so its 39 tests run in `pnpm test`.
- Checks: Node matches `.nvmrc` (≥ 22.18, to strip types); pnpm matches `packageManager`; git; install from the lockfile; every package resolves its dependencies; not on main; no conflict markers; every top-level folder is in the repo map; how far behind origin/main the branch is; at `--end`, tree clean and everything pushed; no `Math.random` in the sim, Bob or the stills; no DOM in the sim or Bob; typecheck, tests, site build.
- `.claude/settings.json`: the session start hook runs `pnpm health --quick`. It never fails the start, so a red result is there for the session to read.
- CI runs `pnpm health`, plus a nightly run that opens or comments on a `bug` issue. Every workflow reads Node from `.nvmrc`.

## Tried and dropped
- **Comparing `node_modules` with the lockfile by hand.** Running `pnpm install --frozen-lockfile` is the check instead: it takes about a second when nothing changed, and it fixes a fresh container.
- **A "PR open" end check.** The container has no GitHub API, so checking that a PR is open is left to the session.

## Learned
- `pnpm -s health` sets `npm_config_loglevel=silent` for the child processes, which hid the output of a failing `pnpm test`. The shell now drops that variable.
- The full run takes about 80 s, and about 70 s of that is the tests (the stills' tests are most of it). That's within budget, and it's the first thing to speed up if the run gets slow.

## Left for next time
Unit 2: the folder and board (`studio/` formats, `producer.md`, `direction.md`, the first milestone, `board.ts`), plus tier 5 of the health check for the studio's files.
