---
title: Docs sweep after m0
kind: tidy
role: director
size: S
status: ready
milestone: m1-green-alpha
---

## Why
The m0-studio retro's sweep ([Keeping docs and the studio in step](../README.md#keeping-docs-and-the-studio-in-step)): eleven sessions changed the studio quickly, and the in-step check only proves that a doc was touched, not that it's still true.

## Done when
- Each doc in `docs/`, `studio/README.md` and `studio/producer-guide.md` has been read against the code and the studio's files, and what's stale is fixed (for example, "planned" next to things that now exist).
- Paths the doc map should cover and doesn't are added to `studio/doc-map.json`.
- The session log lists what was stale, so the next retro can see whether the checks are catching it.

## Not this
Changing what the docs decide (design, direction, the colour language): that's a call for the producer, raised as an ask.
