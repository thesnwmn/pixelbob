---
autonomy: studio-merges     # studio-merges | review-first: see README.md#autonomy-levels
---

# The producer

Your settings, the rules you've given the studio, and what it has learned about your taste. The Director keeps it, and you can correct it any time with `/director`. Changes to this file are gated: they wait for you.

## Autonomy

**Studio merges.** Every session squash-merges its own PR once CI and the end-of-session health check are green and the Critic has no blocking findings. Gated PRs wait for you. Chosen 2026-10-17 ([Settled with the producer](README.md#settled-with-the-producer)).

## Standing rules

- PR titles are conventional commits, `type(scope)!: Summary`, with the summary starting with a capital ([PR titles](../docs/decisions/2026-10-17-pr-titles.md)).
- PR titles and descriptions are short. Details go in the session log, the unit or the docs.
- The backlog lives in `studio/`. Issues are only for things that are wrong, never for features or planned work ([Backlog in files](../docs/decisions/2026-10-17-backlog-in-files.md)).
- Feedback comes through `/feedback`: grill me until the report is complete, write it to the repo, and raise an issue for each thing that's wrong.
- No autopilot (`/go` on a schedule) for now.
- Only I add `producer-ok`, always, even for a gated change I approved in a session. The session opens the PR and asks me ([Gated files](../docs/decisions/2026-10-17-gated-files.md)).

## Taste notes

What the studio has learned from your feedback, each with where it came from. Designers read these before shaping anything.

- Wants to make the calls on direction and taste, and have the studio carry on with everything else without waiting: the studio plan, 2026-10-17.
