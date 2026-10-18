---
title: The level format
kind: build
role: engineer
size: M
status: doing
pr: 32
milestone: m1-green-alpha
needs: []
---

## Why
The Green's levels are data, painted and placed, not code like Bob's test course: an indexed PNG for the materials and JSON for what's in them ([level format](../../docs/tech-and-toolchain.md#level-format)). Everything else in the milestone builds on it.

## Done when
- A level is a folder, `game/levels/<id>/`: `materials.png` (one palette index per material, the palette in `packages/sim`) and `level.json` (title, spawn, finish box, checkpoints, lost bits, lamps, seed).
- `levels.ts` loads it into a `Built` the same way in the browser and in Node, and a scenario can name it. A tiny test level loads in a test and in the game.
- A health check reads every level folder and says what's wrong (unknown palette colour, entity off the map, no spawn or finish), with a broken fixture in its test.
- The tech doc says how to paint one.

## Not this
Checkpoints doing anything (their own unit), decoration (grass, moss tufts, trees), chunking big levels, the editor.
