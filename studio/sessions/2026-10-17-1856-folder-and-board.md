---
date: 2026-10-17
command: /go (before the command existed; read as "build the next unit")
units: [folder-and-board]
pr: 10
issues: []
session: https://claude.ai/code/session_01MoForKqLVyCPc4UoCoZ1G9
health: green at start (quick, from the start hook); green at end
size: S planned; a small share of the context, no compaction
---

## Summary
Built unit 2 of [Building the studio](../README.md#building-the-studio): the studio's files and the board. `studio/` now holds the producer's settings, direction, two milestones, a unit for everything left to build and the first ask. `pnpm board` generates the board from them, and a fifth tier of the health check fails on a file that breaks its format, on a broken link, and on a doc missing from the index.

## The producer said
- `/go`. The command isn't installed yet (it comes with roles-and-commands), so, like the [health check session](2026-10-17-1811-health-check.md), this session built the next unit in the plan.

## Done
- `studio/producer.md` (studio merges, the standing rules settled so far), `studio/direction.md`, `milestones/m0-studio.md` (current) and `milestones/m1-green-alpha.md` (proposed).
- `studio/work/`: twelve units. Two are done (health-check, folder-and-board), four are ready in m0 (roles-and-commands, docs-in-step, github-gate, studio-page), five are shaped in m1 (game-shell, replays, bot-search-spike, bots, release-builds) and one is an idea (fan-out).
- `studio/asks/first-milestone.md`: gated, it asks the producer to confirm the alpha of The Green. It blocks game-shell.
- `studio/board.ts` and `pnpm board` (`--github`, `--json`). It parses its own small front matter subset, so it needs no dependency.
- Health tier 5 (`scripts/health/src/studio.ts`): `studio/files`, `studio/in-flight`, `studio/landed` (`--end`), `docs/index` and `docs/links`, with 26 tests.
- [Backlog in files](../../docs/decisions/2026-10-17-backlog-in-files.md), a decision record. Formats for milestones, direction and the ask's `status` are in [the studio's state](../README.md#the-studios-state).

## Tried and dropped
- **One unit for unit 3 of the plan.** It's an M with three separate jobs (the briefs and skills, the docs-in-step checks, the gate and GitHub setup), so it went on the board as three units.
- **Putting the later studio units (game shell, replays, bots, releases) in m0.** The alpha is what needs them, so they belong to m1, and m0 ends when `/go` works.

## Learned
- `docs/links` found a real broken anchor on its first run: the roadmap linked `art-direction.md#what-we-want-to-settle`, a heading since renamed *Still to settle*. Fixed.
- A heading's anchor keeps the words inside its inline code (`What \`/go\` picks` → `what-go-picks`), so the link check blanks inline code in the text it scans for links, but not in headings.
- No Critic subagent ran. The roles don't exist yet, and this session reviewed its own diff instead. roles-and-commands brings the Critic.

## Left for next time
- **roles-and-commands** (M) is next: after it, `/go` is a real command.
- The producer: answer [first-milestone](../asks/first-milestone.md) whenever suits. It only blocks the game shell, which comes after m0.
