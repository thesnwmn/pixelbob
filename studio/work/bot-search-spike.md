---
title: Can a search bot finish a level?
kind: spike
role: prototyper
size: M
status: done
pr: 27
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
- 2026-10-18 done, #27 ([session](../sessions/2026-10-18-0320-bot-search-spike.md)). **Verdict: yes.** A beam search (4 wide, 8 moves of 20 frames each) found a route through the whole course in 177 s of search in Node: 25,760 steps, finishing in 13.5 s of play with all of Bob, against the producer's 33 s. Replayed from the start, it gives the same run.
  - **What made it work:** a generic deep copy of the world and Bob restores a run exactly (same fingerprint after 600 more frames), in 12 ms. Branching from snapshots, rather than replaying from the start, is what keeps it inside the budget.
  - **Cost:** about 150 steps a second including the snapshots (a bare step is about 4.5 ms), so a level of a minute or so is a few minutes of search, one core.
  - **Found:** hopping is more than twice as fast as rolling (495 cells against 222 in 4 s on the opening ground), so the route is almost all hops. Asked as [hop-speed](../asks/hop-speed.md).
  - **To build** (the bots unit): snapshot and restore in `packages/sim` and `packages/bob` (a `copy()` per class, so new fields can't be missed silently), and the search in `game/`, not imported from the spike.

