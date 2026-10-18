---
name: playtest
description: Take the producer's playtest feedback for Pixelbob - notes or a pasted report from the feedback button - grill them until it's complete, write the report to studio/playtests/, raise an issue for each thing that's wrong, and update the taste notes.
---

# /playtest

The producer played something and says: `$ARGUMENTS`. It may be a report pasted from the build's feedback button (with the build, the scenario, ratings and a replay) or rough notes.

## Grill until it's complete
A few questions at a time, each with options (AskUserQuestion). Stop when there's enough to act on, not when every field is full.
- **What happened**: what they tried, what they expected; where, if there's no replay.
- **Ratings** if missing: fun, difficulty (too easy / right / too hard), frustration, each 1 to 5.
- **Clarify the vague**: "felt off" is too slow, too floaty, or unclear what to do?
- **The handoff card's questions** that weren't answered (the unit's scenario).

## Write the report
`studio/playtests/<date>-<HHMM>-<slug>.md`, with the UTC time it was written, like a session log:

```markdown
---
date: 2026-10-21
by: producer               # or tester
build: preview/pr-41       # or game, or builds/alpha-1
scenario: split-gate       # if there was one
units: [split-action]
fun: 4                     # 1 to 5
difficulty: right          # too-easy | right | too-hard
frustration: 2             # 1 to 5
issues: [12, 13]
---

## What they said
Their words, close to as given, and the answers.

## Wrong
Each thing that's broken, with its issue.

## Liked, and would change
What to keep, what to change. Not issues.

## Replay
The replay, as pasted, if there was one.
```

## Act on it
- **An issue per thing that's wrong**, labelled `bug` (`blocker` if it stops a milestone build), with the build, the scenario, what happened, what was expected, the replay and a link to the report. Nothing that's a feature or a wish goes in issues.
- **Taste notes** in `studio/producer.md`, each with where it came from ("likes crumbs-as-skill: playtest 2026-10-02").
- Units: a `playtest` unit the report settles goes to `done`, or back to `ready` with what to change. Ideas go in `docs/ideas.md` or as `idea` units.
- Land it as `/go` does (steps 3, 7 to 9 of `.claude/skills/go/SKILL.md`). The report is the record, so the PR can say `Session log: none, because the playtest report is the record`.

## Tell them
What you understood, the issues raised, and what will happen next, in a few lines.
