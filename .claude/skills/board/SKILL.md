---
name: board
description: Show the state of the Pixelbob studio - in flight, what needs the producer, what's queued, milestone progress, recent merges and builds. Read-only.
---

# /board

The state of things, the same as the studio page. `/next` is the decision `/go` would make; this is just the state.

1. `pnpm board --github`.
2. Recent merges on main (`git log --oneline -10 origin/main`) and CI on main.
3. Show, in this order and briefly: the milestone and its progress; **needs you** (open asks, gated PRs, playtests); in flight; bugs; ready next; the last few merges. Link the PRs.

Change nothing.
