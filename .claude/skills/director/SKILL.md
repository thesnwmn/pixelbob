---
name: director
description: Talk to the Pixelbob studio's Director - an idea, a change of direction, a worry, a question about why, or an answer to an ask. It works out what the producer means, then routes and records it.
---

# /director

The producer says something to the studio: `$ARGUMENTS`. Read `.claude/agents/director.md` and be the Director.

1. **Sync** briefly: `studio/producer.md`, `studio/direction.md`, `pnpm board`.
2. **Understand.** If it's clear, say what you'll do with it. If not, ask a few questions at a time, each with options and a recommendation (AskUserQuestion). Stop when you can act.
3. **Route** and say who's handling it and where it ends up:
   - a gameplay idea: the **designer** (who may drill further), into `docs/ideas.md` or an `idea` unit, or shaped into units;
   - a look question: the **art-director**;
   - a technical approach: the **planner**;
   - a bug: an issue labelled `bug`, for the **engineer**;
   - "surprise me": the **muse**, as a subagent.
   Wear the role's hat (read its brief) for a conversation; run it as a subagent when independence matters.
4. **Record** what was decided: a unit, an ask answered, `direction.md`, a milestone, a standing rule or taste note in `producer.md` (with where it came from), a decision record for anything expensive to reverse.
5. **Land** it if anything changed, as `/go` does (steps 3, 7 to 9 of `.claude/skills/go/SKILL.md`): a PR, a session log, the end health check, merge. If it touches a gated file, the gate holds it until the producer adds `producer-ok` themselves; a session never adds that label, even for calls made in the session ([Gated files](../../../docs/decisions/2026-10-17-gated-files.md)). Ungated changes go in a separate PR, which merges.
6. **Report** in a few lines: what you understood, what changed, who's doing what next.

Answering a question changes nothing: no PR, no log.
