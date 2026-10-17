---
title: Health check
kind: tool
role: toolsmith
size: S
status: done
milestone: m0-studio
pr: 6
---

## Why
Every session starts and ends on the same question: is this repo ready to develop on? See [Health](../README.md#health).

## Done when
- `pnpm health` runs tiers 1 to 4 (tools, dependencies, repo, code), with a test for each check that feeds it a broken fixture.
- A session start hook runs it; CI runs it on every PR, on main and nightly, and a red nightly opens an issue.

## Not this
The studio tier (with the board), budgets (later).

## Log
- 2026-10-17 done, #6: [session](../sessions/2026-10-17-1811-health-check.md). The end-of-session PR check followed in #7 ([session](../sessions/2026-10-17-1822-pr-check.md)).
