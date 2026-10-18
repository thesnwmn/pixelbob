---
title: Bots and forgiveness
kind: test
role: tester
size: M
status: shaped
milestone: m1-green-alpha
needs: [bot-search-spike]
---

## Why
A number for "too precise" that tracks the producer's difficulty ratings, and proof every level can be finished. See [Automated playtesting](../README.md#automated-playtesting).

## Done when
- The search bot, rebuilt from the [spike](bot-search-spike.md) (snapshot and restore in the sim and Bob, the search in `game/`), finishes each level and reports skips and softlocks.
- For each hard moment, the frames and pixels of slack.

## Not this
Fuzzing and budgets.
