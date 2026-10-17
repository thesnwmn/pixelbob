---
date: 2026-10-17
command: /needs-me
units: []
pr: 19
issues: []
session: https://claude.ai/code/session_01P7LSCfE47ctpanCnT2yPvp
health: green at start; green at end
size: a few minutes
---

## Summary
`/needs-me` with one call open, raised by the [m0 retro](2026-10-17-m0-retro.md) and on #18: who adds `producer-ok` when the producer approves a gated change during a session. The `/needs-me` skill said the session does; the [Gated files](../../docs/decisions/2026-10-17-gated-files.md) decision said never.

## The producer said
- "Only me, always." A session never adds `producer-ok`, even for a call made in that session.

## Done
- The `/needs-me` and `/director` skills now say the gate holds such a PR until the producer adds the label, and that ungated changes go in a separate PR.
- A standing rule in `producer.md`; the producer guide and the decision record say the same.
- This PR is gated (`.claude/` and `producer.md`), so under the new rule it waits for the producer's `producer-ok`.

## Learned
- #16 was the one time a session added the label. The decision record notes it.
