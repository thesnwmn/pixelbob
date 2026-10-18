---
title: Title, map and saves
kind: build
role: engineer
size: M
status: shaped
milestone: m1-green-alpha
needs: [green-1-hills]
---

## Why
The alpha should feel like a game, not a test page: the title screen, the map (a slice through the earth, the Green on top) and saves, as in [the concept doc](../../concept/index.html). The producer's order: one level end to end first, then the shell around the levels.

## Done when
- The title screen leads to the map; the map shows The Green's levels, unlocked in order, and starts one.
- Progress (levels finished, best % of Bob home) is saved in the browser and survives a reload.
- Scenarios still start straight into a level, skipping the title.

## Not this
Settings, other worlds on the map, cloud saves.
