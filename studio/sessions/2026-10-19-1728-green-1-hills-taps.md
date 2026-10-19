---
date: 2026-10-19
command: /go
units: [green-1-hills]
pr: 42
issues: []
session: https://claude.ai/code/session_01NzZTn7YHKGWuRHxXy2f6a8
health: green at start; green at end
size: M planned; S to M in practice, no compaction
---

## Summary
`/go` picked green-1-hills: nothing needed the producer, the only bug left (#36) is theirs for later, and their playtest asked for one jump height at a time. The level now has two low bumps that a tap gets over before the first high step, and that step needs a charged jump.

## Done
- `game/levels/green-1-hills/`: 231 cells wider (1631). After the opening hills, the old 67-cell flat before the first step is replaced by a flat, a 12-cell bump, a flat, a 16-cell bump, and a shallow hollow (y 154) at the foot of the step, which is 30 cells now (was 28). Everything after it is the old level moved right: the checkpoints, the bit, the finish and the lamp in `level.json`, and `LEVEL_WIDTHS`.
- Replays re-recorded: `green-1-hills-run` taps over the bumps and charges the three high obstacles (finishes at frame 1778, 29.6 s, home 93). `green-1-hills-tap` taps whenever he's stuck: over both bumps, then six taps against the step without getting up it.
- Tests (`game/test/levels.test.ts`): rolling doesn't get over either bump, and a tap does. From a stop, a tap or a 10-frame hop doesn't get up the step, and a full charge does. The stall test's starts moved with the level.
- The card asks whether the step reads as a different jump. [The Green](../../docs/worlds.md#1-the-green) says what level 1 is now.

## Tried and dropped
- A 36-cell step from a 160 hollow: no jump got up it, not even a full charge. A test wall of 36 elsewhere had worked, but there Bob happened to lean away from the face as he jumped. In front of this step his full charge rises about 37 cells, so heights had to be measured in place. 32 was too hard while rolling (6 in 13 full charges) and 34 too hard from a stop. 30 is it.
- The throwaway script that drew the level in #34 wasn't kept, so this one read the ground back out of the PNG and inserted the new stretch by columns (3 cells of grass, 7 of dirt, then rock, as the rest of the level is).

## The Tester
- **The bumps:** rolling never gets over either one, even coming downhill. Taps from a stop clear them 72 times in 72. Taps while rolling clear them 94 times in 99; the misses were taps right at contact or 30 to 40 cells out.
- **The step from a stop:** holds of 4 to 12 frames never get up, 14 frames 2 in 11, 16 frames 8 in 11, and 18 frames or more always.
- **The step while rolling:** a short hop (10 to 14 frames) timed right as he meets the face gets up 6 to 9 times in 15. He hooks over the lip. A tap (8 frames or less) makes it 1 in 15, and a full charge 21 in 24.
- **Mashing** in a rhythm still gets up the step, as the producer allowed. Some mashers end in the ravine's pit until R, which isn't new.
- **No softlocks:** between the bumps, in the hollow, anywhere new. Checkpoints light and respawn him.
- **Time:** a decent run takes about 24 s.
- **The flaky test:** the new step test took just over vitest's 5 s, so the level tests now have their own timeout.

## The Critic
Nothing blocking. Taken: the run replay had a stray charge after the finish, and the tap replay barely ran past its tap. Both are re-recorded. Also a shorter PR title, a second start on the second bump, and a Docs line for the in-step check. The level format and the game's files didn't change, only this level's data.

## Learned
- How high Bob jumps depends on how he meets the wall: leaning away, a full charge rose 45 cells; pressed into the face, 37. Measure an obstacle where it stands.
- Taps (2 to 8 frames) reliably clear 12 to 20 cells; rolling (from rest or downhill) clears about 8.

## Left for next time
- The producer's playtest: does the step read as a different jump, given that a well-timed running hop sometimes makes it? If not, a deeper hollow is the knob, with the risk measured above.
- The second step (26, from a dip) wasn't touched. It needed 16 frames or more when built.
