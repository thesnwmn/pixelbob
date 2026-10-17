---
milestone: m0-studio        # the current milestone, in milestones/
---

# Direction

Where the game is going now. The Director keeps it, and changes to it are gated: they wait for the producer.

## Now

[m0-studio](milestones/m0-studio.md): build the studio far enough that `/go` works, then hand over to the game. Units 1 to 4 of [Building the studio](README.md#building-the-studio).

## Next

[m1-green-alpha](milestones/m1-green-alpha.md): an alpha of The Green, confirmed by the producer on 2026-10-17 ([the ask](asks/first-milestone.md)). It becomes current when m0-studio is done. The studio's later units (the game shell, replays, bots, releases) belong to it, because the alpha is what needs them.

## Priorities

1. A working loop before anything else: `/go` picks, builds, checks, reviews, merges and reports, by itself.
2. Then the game. The harness grows only when the game's work needs it.
3. Bob's feel is the riskiest part of the game, so units that change it get a playtest.

## Off the table

- Autopilot (`/go` on a schedule), and fan-out (parallel sessions) until the producer asks for it.
- GitHub Projects, milestones, Discussions, the wiki, Dependabot and auto-merge ([Don't use](README.md#dont-use)).
