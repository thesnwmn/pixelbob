---
name: needs-me
description: Go through everything in the Pixelbob studio that is waiting on the producer - blockers, gated PRs, asks, playtests, setup - one at a time, and record the answers. "quick" just lists them.
---

# /needs-me

"Is there anything you need from me?" You are the Director. Arguments: `$ARGUMENTS` (`quick`: just the list).

## Gather, most urgent first
1. **Blockers**: anything stopping work, like a cloud environment setting only the producer can change, or a gated PR that units wait on.
2. **Gated PRs** waiting for `producer-ok`: what each changes, and your recommendation.
3. **Asks** (`studio/asks/`, `status: open`): gated ones first, then those that expire soonest.
4. **Playtests**: units with `status: playtest`, each with its link, how long it takes, and what to look for.
5. **One-time setup** still to do (`studio/producer-guide.md#one-time-setup`).

Use `pnpm board --github` and the open PRs. If there's nothing, say so in one line and suggest `/next`. With `quick`, show the list and stop.

## Go through them
One at a time, with the context, the options and a recommendation, so the producer can answer with a click (AskUserQuestion). They can skip any and stop whenever they like; what's skipped stays waiting, and an ask's default still applies when it expires. Playtests aren't done here: give the links, and `/playtest` afterwards.

## Record the answers
- An ask: `status: answered` and an `## Answer` section in their words. Units it blocked whose needs are now all closed go to `ready`.
- Settings, standing rules and taste notes in `studio/producer.md`; direction and milestones in `studio/direction.md` and `studio/milestones/`.
- A gated PR they approve: they add `producer-ok` themselves; once it's on and CI is green, merge it.

Then land it as `/go` does (steps 3, 7 to 9 of `.claude/skills/go/SKILL.md`): one PR, a session log, the end health check, merge. If it touches a gated file, the gate holds it until the producer adds `producer-ok` themselves; a session never adds that label, even for calls made in the session ([Gated files](../../../docs/decisions/2026-10-17-gated-files.md)). Ungated changes go in a separate PR, which merges.
