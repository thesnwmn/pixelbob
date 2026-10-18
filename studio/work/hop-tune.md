---
title: Slow hopping slightly
kind: build
role: engineer
size: S
status: doing
milestone: m1-green-alpha
needs: [hop-speed]
---

## Why
Chaining hops moves Bob more than twice as fast as rolling (495 cells against 222 in 4 s on the opening ground, `node prototypes/03-bot-search/src/speed.ts`). The producer wants it "slightly less, probably different": hopping should still pay, but by less ([the ask](../asks/hop-speed.md)).

## Done when
- Chained hops are still faster than rolling on flat ground, but by clearly less: about half again as fast rather than twice, measured by `speed.ts`. Single jumps over obstacles reach as high and far as before.
- Done continuously, as a tweak in `RANGES` (less push in the air, or landings that soak up a little speed), never a switch.
- Kept replays re-recorded (`--update`) and said so in the PR; a scenario and card asking the producer to compare hopping and rolling.
- A playtest: the producer says whether it feels right.

## Not this
Rolling speed, jump height, the bots.
