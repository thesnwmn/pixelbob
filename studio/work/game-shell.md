---
title: Game shell and scenarios
kind: build
role: engineer
size: M
status: doing
milestone: m1-green-alpha
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
