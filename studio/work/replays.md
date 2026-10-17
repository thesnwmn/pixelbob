---
title: Replays and the Tester's kit
kind: test
role: engineer
size: M
status: shaped
milestone: m1-green-alpha
needs: [game-shell]
---

## Why
The sim and Bob are deterministic, so a replay is a test case. See [Automated playtesting](../README.md#automated-playtesting).

## Done when
- `packages/play` records and plays back input frame by frame, and runs a level headless in Node.
- The feedback button attaches the replay; the health check replays `game/replays/` and compares outcomes.
- Filmstrips of a run render to PNG.

## Not this
Bots (bot-search-spike, bots).
