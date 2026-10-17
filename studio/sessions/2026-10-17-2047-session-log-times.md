---
date: 2026-10-17
command: /director "should we make session logs named in such a way they can be sorted within a day?"
units: []
pr: 20
issues: []
session: https://claude.ai/code/session_01P7LSCfE47ctpanCnT2yPvp
health: green at start; green at end
size: a few minutes
---

## Summary
The producer asked whether session logs should sort within a day. They should: thirteen logs from 2026-10-17 listed alphabetically, not in the order they happened. Logs are now `<date>-<HHMM>-<slug>.md`, with the UTC time the log is written.

## The producer said
- "Should we make session logs named in such a way they can be sorted within a day?"

## Done
- `board.ts` (via `studio/files`) fails a log named without a valid time, with a test on broken names.
- The existing logs are renamed with the UTC time each was first committed, and every link to them is updated.
- The session-log format in `studio/README.md` and the PR template name the new pattern.

## Tried and dropped
- **A counter per day** (`2026-10-17-03-…`). Parallel sessions would race for the same number. A time can't collide like that.

## Left for next time
- The `/go` skill and the in-step check's hint still say `<date>-<slug>`. Both are gated, so they're in a separate PR for the producer. Until then, `board.ts`'s message says the right name.
- Playtest reports (`studio/playtests/`) could take the same pattern when the first one lands.
