---
title: Can a search bot finish a level?
kind: spike
role: prototyper
size: M
status: shaped
milestone: m1-green-alpha
needs: [replays]
---

## Why
Proving levels finishable and measuring slack needs a bot that searches inputs in the deterministic sim. Whether that's fast enough is the unknown.

## Done when
- A verdict: can a search over input sequences finish a simple Green level within a few minutes in Node, and what it learned.
- Kill criterion: no route found in ten minutes on a level a person finishes in thirty seconds.

## Not this
The forgiveness measure (bots).
