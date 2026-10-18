---
date: 2026-10-18
command: /go
units: [bot-search-spike]
pr: 27
issues: []
session: https://claude.ai/code/session_01HGxWwztdMSYVSeDXX6hYfX
health: green at start
size: M planned; well under a session
---

## Summary
`/go` picked the bot search spike: the milestone's riskiest unknown, now unblocked by replays. The verdict is **yes**. A beam search over short input moves, branching from snapshots of the sim, found a route through Bob's whole test course in 177 s of search in Node, against a kill criterion of ten minutes.

## The producer said
- `/go`, with no arguments.

## Done
- `prototypes/03-bot-search`:
  - `src/snapshot.ts`: a generic deep copy of the world and Bob.
  - `src/search.ts`: the beam search. It writes the route as a replay in the game's format and checks it by playing it again from the start.
  - A page that plays the route in the game's renderer.
- The verdict in [the unit](../work/bot-search-spike.md), and what to build in [bots](../work/bots.md).
- An ask, [hop-speed](../asks/hop-speed.md): hopping is more than twice as fast as rolling.

## Review
- The critic re-ran the search (same route, token for token), the snapshot check and the hop speeds, and they held.
- Its blocking finding: the spike had rewritten the bots unit, which is outside the prototyper's limits. That edit is reverted. The Director's call: bots waits on hop-speed, because the slack it measures depends on the answer.
- Also fixed:
  - The search now checks its run against a fresh replay fingerprint for fingerprint, and `src/speed.ts` reproduces the hop speeds.
  - The log says the search was only tested where further right is always better.
  - The page's port clashed with the game's.
  - `dev:bot-search` is added, and the spike's code is in the determinism scan.

## Tried and dropped
- Nothing: the first design worked. Without snapshots, each branch would replay from the start, and a minute-long level wouldn't fit the budget.

## Learned
- A deep copy of every own field restores the world and Bob exactly, in 12 ms. Their state is all fields and typed arrays, with no closures or hidden state, which is what makes the search possible.
- The search runs at about 150 steps a second, with snapshots, on one core.
- The bot finishes in 13.5 s, with all of Bob, by chaining hops; the producer took 33 s rolling.

## Left for next time
- The bots unit: `copy()` in the sim and Bob (a real API, so a new field can't be missed), the search in `game/`, then skips, softlocks and slack.
- The hop-speed ask.
