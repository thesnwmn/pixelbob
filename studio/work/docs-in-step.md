---
title: Docs in step
kind: tool
role: toolsmith
size: S
status: doing
milestone: m0-studio
---

## Why
Docs that drift from the code mislead every later session. The health check should catch a change that leaves its docs behind. See [Keeping docs and the studio in step](../README.md#keeping-docs-and-the-studio-in-step).

## Done when
- `studio/doc-map.json` maps code paths to the docs that describe them, and a check fails a branch that changes a mapped path and none of its docs, unless the PR says `Docs: none needed, because …`.
- The same for the unit (`Unit: none, because …`) and the session log (`Session log: none, because …`).
- A test for each, with a broken fixture.

## Not this
Whether the docs are right: that's the Critic's.
