---
date: 2026-10-17
command: /needs-me
units: []
pr: 16
issues: []
session: https://claude.ai/code/session_01P7LSCfE47ctpanCnT2yPvp
health: green at start; green at end
size: a few minutes
---

## Summary
`/needs-me` after docs-in-step and studio-page merged. Two things were waiting: the one-time setup ask, and whether the in-step check should be gated (raised in [docs-in-step](2026-10-17-docs-in-step.md)).

## The producer said
- One-time setup: "Done, close the ask." The `main` ruleset is on.
- Gating the in-step check: "Gate the logic and workflow." So `instep.ts` and `in-step.yml` are in `.github/gated.json`, but the doc map isn't.

## Done
- [one-time-setup](../asks/one-time-setup.md) answered. release-builds still needs game-shell, so it stays shaped.
- `.github/gated.json` and [Gated files](../../docs/decisions/2026-10-17-gated-files.md) gate the in-step check. This PR is gated because it changes the gate, and the producer let it through in this session (`producer-ok`).

## Left for next time
- m0-studio's units are all done and its setup is in, so its exit criteria hold once `/go` has run end to end, which it now has twice. Next is the retro, then making m1-green-alpha current (a change to `direction.md`, so gated), then shaping m1.
