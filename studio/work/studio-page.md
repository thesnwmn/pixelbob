---
title: Studio page
kind: tool
role: toolsmith
size: S
status: done
pr: 15
milestone: m0-studio
---

## Why
The producer and anyone watching should see the board without opening a session. See [Transparency](../README.md#transparency).

## Done when
- The board is built to `…/pixelbob/studio/` on Pages, linked from the site index above the prototypes.
- It's rebuilt on every merge to main and whenever a PR or issue opens or closes, with open PRs and bugs from GitHub.

## Not this
Ratings over time (with playtests), builds (release-builds).

## Log
- 2026-10-17 done, #15: [session](../sessions/2026-10-17-2018-studio-page.md). `studio/page.ts`, written to `_site/studio/` by the site build and linked from the index; rebuilt on merges and when a PR or issue opens or closes; the `studio/page` check.
