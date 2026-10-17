---
title: Game shell and scenarios
kind: build
role: engineer
size: M
status: done
milestone: m1-green-alpha
pr: 21
scenario: shell
needs: [first-milestone]
---

## Why
The real game, distinct from the prototypes, and the way a playtest drops the producer exactly where a change is. See [Scenarios](../README.md#scenarios-putting-you-where-the-change-is).

## Done when
- `game/` is a Vite app built to `…/pixelbob/game/`, running the sim and Bob.
- `?scenario=<id>` starts it from `game/scenarios/`, with the handoff card on screen.
- The feedback button copies a report for `/feedback`.

## Not this
Replays (own unit), levels (the milestone's own units), the title screen and map.

## Log
- 2026-10-17 done, #21 ([session](../sessions/2026-10-17-2118-game-shell.md)). `game/` with four scenarios (`start`, `shell`, `ice`, `runny`) on Bob's test course, the card, the feedback button, and a `code/scenarios` health check. Replays, levels and portrait framing are left for their own units.
