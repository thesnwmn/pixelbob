---
name: go
description: Do the most useful next thing in the Pixelbob studio - health check, sync, pick one unit from the board, do it in its role, review it, ship and merge a PR, report. Arguments steer it - "small", "think", "anyway", or what to work on.
---

# /go

"I've got some budget: do the most useful next thing." You are the Director, then whichever role the unit needs. The full design is `studio/README.md#invocation`; this is the checklist. Arguments: `$ARGUMENTS` (empty: your choice; `small`: an S unit; `think`: ideas or shaping, not code; `anyway`: carry on past a red health check; anything else: steer the pick).

## 0. Health
Run `pnpm health` (the full run). If it's red, stop what was asked: this session is now a `fix` unit for the failing check (`studio/README.md#when-its-red-at-the-start`). Say so in one line. Only `/go anyway` carries on, naming the failure in the PR and the report.

## 1. Sync
- `pnpm board --github`: milestones, what needs the producer, in flight, bugs, open PRs, ready units.
- `studio/producer.md` (autonomy, standing rules, taste notes) and `studio/direction.md`.
- Open PRs: reviews and comments since the last session, especially the producer's. CI on main.

## 2. Pick
Top of this list first (`studio/README.md#what-go-picks`):
1. Main is broken (step 0, CI on main, a failed deploy).
2. The producer's input not yet handled: PR comments, answered asks that unblock something.
3. Bugs: `blocker` first.
4. Open PRs that had the producer's call (merge or rework).
5. The current milestone's next ready unit, riskiest first.
6. Shaping, when fewer than about three units are ready (Designer and Planner).
7. Balance: after about four build units in a row, a test or tidy unit; after a milestone, a retro.
8. Nothing obvious: the Muse pitches, or the Tester hunts bugs.

Say which unit and why in two or three lines. A small bug can be fixed straight from its issue, without a unit.

## 3. Claim
- If this branch's PR is already merged, restart the branch from `origin/main` first (keep its name). Never stack on merged history.
- Set the unit's `status: doing`, commit, push, and open a **draft PR** at once (title per `studio/README.md#prs`, checked by `pr-title`). Put its number in the unit's `pr`.

## 4. Work
- Read the role's brief in `.claude/agents/<role>.md` and work in that hat.
- Spikes state their question and kill criterion before any code. Fixes reproduce first.
- Stop signs (`studio/README.md#sizing-and-spirals`): context compacted once and not near done; two approaches failed; the diff heading past about 800 lines; *Done when* turns out wrong. Then stop cleanly: land what works (switched off if unfinished), write the handoff in the unit's log, split the rest into new units.

## 5. Check
`pnpm health --quick` as often as useful. For anything that changes play, run the **tester** subagent on the unit.

## 6. Review
Run the **critic** subagent with only the unit's path and the branch, never your reasoning. Fix its blocking findings before the PR leaves draft; answer the rest on the PR.

## 7. Ship
- The unit: its status (`done`, `playtest`, back to `ready` with a handoff, or `dropped`) and a log line linking the session log.
- The docs that describe what changed, decisions in `docs/decisions/`, the concept doc if it's affected. A new tool, format or convention gets a check in `scripts/health/`.
- The session log, `studio/sessions/<date>-<slug>.md` (`studio/README.md#session-logs`).
- The PR description per `.github/pull_request_template.md`: short, linking the log.

## 8. Health again
Push everything, then `pnpm health --end`. Its summary line goes in the PR description.

## 9. Merge
Take the PR out of draft. Wait for CI by watching the PR (subscribe to its activity), not by polling. When CI is green on the latest commit: **squash-merge** (if `autonomy: studio-merges`). If main moved on, merge main in and check again first.
- **Gated** (it changes `producer.md`, `direction.md`, a milestone, the colour language, Bob's character, `.claude/` or the health check's rules): label it `gated`, leave it open, and say so. Ungated work from the same session goes in a separate PR.
- Can't be made green: take the broken code out, land the handoff (`studio/README.md#main-is-the-truth`).

## 10. Report
About five lines, like this:

```
Done: split action (build, M) → PR #41, merged. Health: green at start and end.
Play: https://…/preview/pr-41/game/?scenario=split-gate (2 min)
  Try splitting on the plate and going on without the piece.
Needs you: 1 ask (split direction on touch, default "across the swipe"), expires in 3 sessions.
Next up: piece HUD (S), then the second Green level (shape).
```

If budget is left after an S unit, take a second S unit from a clean point (a new branch from main).
