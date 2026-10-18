---
title: Checkpoints
kind: build
role: engineer
size: S
status: doing
milestone: m1-green-alpha
needs: [level-format]
---

## Why
The Green has ordinary checkpoints (the producer's call, 2026-10-18 in `/go`): touch one and that's where Bob comes back. A piece left behind as a checkpoint waits for The Foundry.

## Done when
- A checkpoint in `level.json` is a marker in the level; Bob touching it makes it his respawn point, shown as lit.
- R and losing all of Bob bring him back whole at the last checkpoint (or the spawn), with the level as it was.
- Replays record it like any other run; tests cover touching, respawning and a replay through a checkpoint.

## Not this
A piece as a checkpoint (an idea, for The Foundry), saves between sessions.
