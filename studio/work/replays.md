---
title: Replays and the Tester's kit
kind: test
role: engineer
size: M
status: doing
milestone: m1-green-alpha
needs: [game-shell]
pr: 23
scenario: shell
---

## Why
The sim and Bob are deterministic, so a replay is a test case. See [Automated playtesting](../README.md#automated-playtesting).

## Done when
- The game records and plays back input frame by frame, and runs a level headless in Node (`game/src`; first written as a `packages/play`, see the log).
- The feedback button attaches the replay; the health check replays `game/replays/` and compares outcomes.
- Filmstrips of a run render to PNG.

## Not this
Bots (bot-search-spike, bots).

## Log
- 2026-10-17 started, #23. Recording, playback and the headless runner went into `game/src` (`replay.ts`, `play.ts`) rather than a new `packages/play`: `Play` already runs there without a DOM, and nothing outside the game needs it yet. A package can come when the bots outgrow `game/`.
