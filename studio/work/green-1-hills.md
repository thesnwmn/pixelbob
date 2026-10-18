---
title: The Green, level 1: hills
kind: build
role: designer
size: M
status: playtest
pr: 34
milestone: m1-green-alpha
needs: [level-format, checkpoints]
---

## Why
The Green is four levels and a finale (the producer's call, 2026-10-18 in `/go`), each teaching one thing ([The Green](../../docs/worlds.md#1-the-green)). This one teaches hills and momentum: roll, coast, build speed downhill to crest a rise, and a charged jump or two. No water, no moss. Short, about a minute.

## Done when
- The level painted and placed in `game/levels/`, with checkpoints, in the Green's colours ([art direction](../../docs/art-direction.md)).
- A scenario at its start with a handoff card, and a kept replay that finishes it.
- A playtest: the producer plays it and rates it.

## Not this
Decoration beyond what the material layer gives, other levels' ideas, title and map.

## Log
- 2026-10-18 built, #34 ([session](../sessions/2026-10-18-1205-green-1-hills.md)). 1400 × 200: a meadow, rolling hills, a 26-cell step, a 56-cell ravine (a lost bit at the bottom, two steps back out), a second 26-cell step, then downhill to the finish. Checkpoints after the first step and after the ravine. A scripted run finishes in 26 s; a first play should take about a minute. Waiting on the producer's playtest.
  - **Tuned by measurement** (each obstacle from 8 nearby starts): a full charge clears each step and the ravine 8 times in 8, a tap or rolling never does. Higher steps (28 to 30) or a wider ravine (64 and up) made a good jump fail half the time.
  - **Momentum doesn't teach yet:** rolling tops out at about 85 px/s even downhill, and a standing full charge jumps as far as a running one, so "build speed downhill to crest a rise" can't be built. The level teaches charged jumps instead. For later: [#36](https://github.com/thesnwmn/pixelbob/issues/36).
  - **Found:** Bob sometimes stalls on gentle grass slopes ([#35](https://github.com/thesnwmn/pixelbob/issues/35)); the scripted run taps out of one.
