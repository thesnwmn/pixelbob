---
title: Can a search bot finish a level?
kind: spike
role: prototyper
size: M
status: doing
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

## Log
- 2026-10-18 started. There's no Green level yet, so the stand-in is Bob's test course (`shell`), which the producer finished in 33 s ([playtest](../playtests/2026-10-18-0300-shell-lava-piece.md)).
  - **Question:** can a search over input sequences, in Node, find a run that gets Bob to the course's finish within ten minutes?
  - **Kill criterion:** no finishing route in ten minutes of search.
  - **Also measured:** steps per second, and whether the sim's state can be snapshotted and restored exactly (there's no clone today, so without one every branch replays from the start).
