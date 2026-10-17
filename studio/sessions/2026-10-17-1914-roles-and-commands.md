---
date: 2026-10-17
command: /go (before the command existed; read as "build the next unit")
units: [roles-and-commands]
pr: 11
issues: []
session: https://claude.ai/code/session_01MoForKqLVyCPc4UoCoZ1G9
health: green at start; green at end
size: M planned; well under one session of context, no compaction
---

## Summary
Built roles-and-commands, the top ready unit in m0-studio. The eleven roles are subagent briefs in `.claude/agents/`, and the six commands are skills in `.claude/skills/`. From the next session, `/go` is a real command.

## The producer said
- `/go` again. The command still didn't exist in this session, so this session followed the plan: the board's top ready unit was this one.
- Asked whether to merge this PR, since it changes gated files (and #10 did too, merged without asking): "Merge".

## Done
- `.claude/agents/`: a brief per role in [the roles table](../README.md#the-roles): what it reads first, its job, what it may change, what it never does. The Muse and the Critic can't edit, and the Tester writes only reports.
- `.claude/skills/`: `go` (the ten steps of [Invocation](../README.md#invocation) as a checklist), `next`, `status`, `needs-me`, `director` and `feedback`.
- `feedback` defines the playtest report (`studio/playtests/<date>-<slug>.md`), and `board.ts` now reads and checks it: ratings 1 to 5, difficulty from a fixed list.
- Health: `studio/roles` (every brief, every roles-table row and `ROLES` in `board.ts` agree) and `studio/commands` (every skill has a section in the producer guide, and the other way round), with 8 more tests.
- `CLAUDE.md` points sessions at the commands and roles. The Toolsmith's *May change* now includes `scripts/` and `.claude/`, which it has been changing all along.

## Tried and dropped
- **Gating this PR by hand.** `.claude/` is gated, but the gate check is the github-gate unit, and this PR builds a unit of the plan the producer approved. So the session asked the producer instead.

## Learned
- Subagents and skills are read when a session starts, so the Critic couldn't review its own PR: this session reviewed its diff itself, again. The next session has the `critic` subagent.

## Left for next time
- **docs-in-step** and **github-gate** (both S) are ready. github-gate brings the gate check, and with it the producer's one-time setup.
- The first real `/go` should be watched: it's the first time the skill runs, and anything it gets wrong is a fix to `.claude/skills/go/SKILL.md`.
