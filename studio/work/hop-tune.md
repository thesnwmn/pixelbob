---
title: Slow hopping slightly
kind: build
role: engineer
size: S
status: done
pr: 29
milestone: m1-green-alpha
needs: [hop-speed]
scenario: hops
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

## Log
- 2026-10-18 built, #29 ([session](../sessions/2026-10-18-0815-hop-tune.md)). A new tweak, `hop` (0.25): a jump's lean forward fades smoothly from top speed to 1.25 times it, and a landing soaks up three quarters of the speed past top speed. On flat ground the best hopping rhythm is now 1.6 times rolling (it was over 3), a typical one 1.5. Rolling is unchanged, and a jump released at up to top speed flies exactly as before.
  - Not quite as *Done when* says: a jump from faster than top speed (downhill, or after a long wind-up while rolling) leans less, landing a few cells shorter. Over the hills, hopping is still about twice rolling (it was four times). Both are on the card for the playtest.
  - The kept replays re-recorded; the producer's no longer reaches the lava, so a piece taking over is now tested directly in `packages/bob`.
- 2026-10-18 playtested by the producer: "It looks good." Done.
