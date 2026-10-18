---
date: 2026-10-18
command: /go
units: [level-format, checkpoints, green-1-hills, green-2-ponds, green-3-moss, green-4-finale, title-map-saves, audio-spike]
pr: 30
issues: []
session: https://claude.ai/code/session_01HGxWwztdMSYVSeDXX6hYfX
health: green at start; green at end
size: shaping, a short session
---

## Summary
`/go` chose shaping over the two units that were ready. The milestone read 5 of 7 done, but none of its heart was on the board: the Green's levels, the level format, checkpoints, the title, the map, saves and the audio prototype. The Designer asked the producer three questions, then shaped eight units, and the Planner set their order. The milestone now reads 5 of 15.

## The producer said
- The Green's levels: "Four, with a finale" (over three, one idea each, or one long level).
- Checkpoints: "Classic now, piece later" (recommended).
- Order: "One level end to end first" (recommended).

## Done
- Units:
  - [level-format](../work/level-format.md) (M, ready): the PNG and JSON format, a loader that works in the browser and in Node, and a health check.
  - [checkpoints](../work/checkpoints.md) (S).
  - Four levels, each M and for the Designer: [hills](../work/green-1-hills.md), [ponds](../work/green-2-ponds.md), [moss](../work/green-3-moss.md) and [the finale](../work/green-4-finale.md), in order.
  - [title, map and saves](../work/title-map-saves.md) (M), after the first level.
  - An [audio spike](../work/audio-spike.md) (S, ready).
- The bots unit moved to ready: its needs had landed.
- The level plan is in [The Green](../../docs/worlds.md#1-the-green).

## Left for next time
- level-format first: everything in the milestone builds on it.
- Decoration (grass, moss tufts, trees from the material layer) isn't a unit yet. Shape it if the first level looks bare in its playtest.
