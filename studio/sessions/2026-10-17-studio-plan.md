---
date: 2026-10-17
command: (before the studio existed) "write a plan for the harness"
units: []
pr: 5
issues: []
session: https://claude.ai/code/session_0139sphLv4SLHjr7ufHZ7Cws
health: no health check yet; typecheck failed at first because nothing was installed (pnpm install fixed it); typecheck and tests green at end
size: one session; about a fifth of the context, no compaction
---

## Summary
Planned the agent harness ("the studio") that builds the game from here, and the producer's side of it. Docs only, plus the PR template. The design is [the studio](../README.md) and the [producer guide](../producer-guide.md).

## The producer said
- Roles: producer (direction) and play tester. Input goes to a director, who questions to find the intent and routes it to the right role. Otherwise just "go" when there's budget.
- Units fit in a session, or half of one; split anything that spirals. Playable alpha and beta builds, and targeted builds that put the tester where the change is, with notes on what to look for.
- Be creative, original, agile, brave, thorough, transparent, documented. Prototype before committing. Give the producer tools to tweak and build levels.
- Runs in Claude cloud sessions with GitHub. No long-running agent yet, maybe later.
- A health check script at the start and end of every session: red at the start means that session fixes it and finishes. It must evolve with the repo.
- All state on main for the next run → *main is the truth*: every session merges its work.
- Merging: the studio merges its own PRs. PR titles and descriptions short and to the point, with a template.
- Feedback through `/feedback`; grill the producer, then raise issues automatically.
- Autopilot (scheduled `/go`): not now.
- The eleven roles are a good starting set.
- Backlog in the repo; issues only for things that are wrong (bugs), not features.
- Define the repo structure. Questioned the doc numbers → dropped.
- Docs and studio files must be near hard-wired into the loop so nothing drifts.
- Asked for `/next` (go without doing) and `/needs-me` (anything waiting on the producer).
- Asked for this: a session log per session, in its PR.

## Done
- `studio/README.md`: the studio, with the repo map, roles, invocation and isolation, health check, main is the truth, session logs, docs in step, GitHub use, builds, playtesting, build order.
- `studio/producer-guide.md`: six commands (`/go`, `/next`, `/needs-me`, `/director`, `/feedback`, `/status`), asks, playtests, trust, one-time setup.
- Design docs renamed by subject (`docs/bob.md`, not `docs/08-bob.md`), with every link, code comment and the concept doc updated.
- `.github/pull_request_template.md`.

## Tried and dropped
- **Producer merges everything at first.** Left state stranded on branches between sessions. Replaced by the studio merging its own PRs, with gated PRs waiting.
- **Issues as the feedback record, one per report.** Replaced by issues only for things that are wrong; the report lives in the repo.
- **Code owners to enforce gating.** The studio's PRs are opened under the producer's account, and GitHub doesn't let you approve your own PR. Replaced by a gate check and a `producer-ok` label.
- **Numbered design docs.** The numbers only recorded when a doc was written, and parallel branches would race for the next one.
- **A shared journal file.** Parallel branches would conflict on it. Replaced by one session log per session.

## Learned
- Cloud sessions are given their branch name, so nothing in the studio may depend on branch names.
- A fresh container has no `node_modules`; that's the first thing the health check covers.
- The producer wants short PRs, wants to be asked rather than to read, and cares that the record is complete and can't drift.

## Left for next time
Merge PR #5. Then `/go` starts with unit 1 of [Building the studio](../README.md#building-the-studio): the health check (`scripts/health/`, the session start hook, CI on `pnpm health`, the nightly run). Before then, the producer can set up the ruleset on `main` from the [one-time setup](../producer-guide.md#one-time-setup).
