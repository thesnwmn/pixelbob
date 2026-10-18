---
title: The level format
kind: build
role: engineer
size: M
status: done
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

## Log
- 2026-10-18 done, #32 ([session](../sessions/2026-10-18-1104-level-format.md)). `game/levels/<id>/` holds `materials.png`, read by colour in the level palette (`PAINT`, packages/sim; air is black, any indexed, RGB or RGBA PNG, transparent is air), and `level.json`. One `parseLevel` builds it in the browser (only the level a scenario needs) and in Node (`scripts/load-levels.ts`). `node game/scripts/levels.ts` checks the levels (the `code/levels` health check), writes the palette for paint tools and starts a new level. The `tiny` level and scenario load in a test and play to the finish in the browser.
  - A painted level's world uses its own seed, not the scenario's: the same world whichever scenario starts in it.
  - Not yet: temperature and back-wall layers (nothing holds ice or lava at temperature), decoration, chunks.
