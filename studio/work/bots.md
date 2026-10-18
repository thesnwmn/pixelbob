---
title: Bots and forgiveness
kind: test
role: tester
size: M
status: shaped
milestone: m1-green-alpha
needs: [bot-search-spike, hop-tune]
---

## Why
A number for "too precise" that tracks the producer's difficulty ratings, and proof every level can be finished. See [Automated playtesting](../README.md#automated-playtesting).

## Done when
- The search bot, rebuilt from the spike, finishes each level and reports skips and softlocks.
- For each hard moment, the frames and pixels of slack.

## Not this
Fuzzing and budgets.

## Log
- 2026-10-18 the Director: now waits on the [hop-speed](../asks/hop-speed.md) ask as well, because the slack it measures depends on whether hopping stays the fastest way. The [spike](bot-search-spike.md)'s log says what to build.
- 2026-10-18 the Director: hop-speed answered (slow hopping slightly), so this waits on [hop-tune](hop-tune.md) instead.
