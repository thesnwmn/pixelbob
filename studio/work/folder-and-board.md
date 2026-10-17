---
title: Folder and board
kind: tool
role: toolsmith
size: S
status: doing
milestone: m0-studio
pr: 10
---

## Why
The studio keeps its state in files, so every session reads the same backlog from main. See [The studio's state](../README.md#the-studios-state).

## Done when
- `studio/` holds its formats: `producer.md`, `direction.md`, milestones, units and asks, with the first milestone and units for the rest of the studio.
- `pnpm board` generates the board from them, and the studio tier of the health check fails on a file that doesn't follow its format.
- The decision to keep the backlog in files is recorded.

## Not this
The studio page (own unit), the doc map and the PR-description checks (docs-in-step), the commands (roles-and-commands).

## Log
