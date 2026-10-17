# 12 The studio

How a team of agents builds Pixelbob from here, with one human as producer and play tester. This is the plan for the harness ("the studio"): what it's made of, where it keeps its state, who's in it, how each role is invoked and kept apart, and how builds reach the play tester. [13 Producer guide](13-producer-guide.md) is the same thing from the producer's side: what you type, what you get back.

**Status:** planned. Nothing here is built yet; [Building the studio](#building-the-studio) is the order it gets built in, one session-sized unit at a time.

## TL;DR

```
 producer ──"/go", "/director …", "/feedback …"──►  Director  ── reads ──►  studio/ (the board, on main)
    ▲                                                  │                        + open PRs + feedback issues
    │                                                  │ picks one unit, wears the right hat
    │                                                  ▼
    │      Designer · Muse · Art director · Planner · Prototyper · Engineer · Toolsmith · Tester · Release
    │                                                  │ (in the session's own thread, or as an isolated subagent)
    │                                                  ▼
    │                                     branch → draft PR → checks → Critic (fresh eyes) → merge
    │                                                  │
    └──── playable build (preview link that drops you into the scenario) + "what to look for" + feedback button
```

- **One way in.** Everything the producer says goes to the **Director**, who asks what you mean when it isn't clear, then routes it: a design question to the Designer, a look question to the Art director, a bug to the Engineer.
- **"go" is enough.** `/go` makes the Director pick the most valuable next unit from the board, do it, ship it as a PR and tell you what it needs from you, if anything.
- **A unit fits in a session.** Every unit is sized S (half a session) or M (one session) before it starts. Anything bigger is split first, and anything that starts to spiral is stopped, handed off and split.
- **All state is in the repo.** `studio/` holds the board as one file per unit, the producer's settings, the asks waiting on you, milestones and playtest reports. Decisions go in `docs/decisions/`. A session's memory is the repo, so nothing depends on a conversation surviving.
- **Main is the truth.** Every session ends with its work merged to main, finished or not: unfinished code lands switched off, and a failed attempt lands as a handoff note. The next session starts from main and nothing else. The only PRs left open between sessions are the ones waiting for your call.
- **Visible.** Every unit opens a draft PR as soon as it starts, so the work in progress shows on GitHub while the session runs. A generated **studio page** on Pages shows in flight, needs you, next, milestone progress, recent work, decisions and builds.
- **Playable.** Every PR that changes play gets a preview link that drops you straight into a **scenario** (a level, a place, Bob's state) with a card saying what changed and what to look for, and a feedback button that sends your notes with an exact **replay** of what you did.
- **Healthy in, healthy out.** Every session starts by running `pnpm health`, which checks the tools, dependencies, code and studio files. If it's red, that session's only job is to make it green. Every session ends by running it again, as proof it left the repo in a good state. CI runs the same script. It grows with the repo.
- **Bots play too.** The sim is deterministic and runs in Node, so the Tester proves levels can be finished, measures how forgiving they are, replays your runs as regression tests and renders filmstrips the agents (and you) can look at.

## Where it runs

**Claude Code cloud sessions with GitHub access**, like the one that wrote this doc. There's no long-running agent, server or CLI. That shapes the whole design:

- **A session is the unit of execution.** You open one on the repo (claude.ai/code, on the web or the app), type a command, and it works until the unit is done. The container is thrown away afterwards, so anything worth keeping is pushed.
- **The repo is the only memory.** A new session knows what `CLAUDE.md`, `studio/` and the docs tell it, plus what it reads from GitHub (open PRs, reviews, issues, CI). So every session ends by writing down where it got to.
- **The branch comes with the session.** Cloud sessions are given their branch name, so the studio never relies on branch names; a unit records its PR number instead.
- **GitHub is the shared surface.** PRs, reviews, CI and the preview builds are where you and the studio meet outside a session. A session can watch its own PR's CI and review comments while it's open; once it ends, the next `/go` picks up whatever happened.
- **The cloud gives a few extras for later:** starting parallel sessions (fan-out) and scheduled tasks (autopilot). Both are optional steps below, not foundations.

Nothing here assumes a session lives longer than one unit, so moving to a long-running agent later would change the invocation, not the formats: it would read and write the same `studio/` files and PRs.

## Principles

What the brief asks of the studio, and what each turns into here.

| Asked | So the studio |
|---|---|
| Creative | Tries ideas as **spikes** in `prototypes/` before committing to them. The **Muse** exists to suggest things nobody asked for. |
| Original | The Muse is briefed to start from the sim and Bob ("what can only happen here?"), not from other games. Prior art ([06](06-prior-art.md)) is a check, not a source. |
| Agile | Plans only the current milestone in detail and the next one in outline. Units are shaped just before they're needed. The harness itself is reviewed at every milestone. |
| Brave | Every spike states its **question and its kill criterion before any code**. Dropping is a normal outcome, recorded with what was learned, like the lattice and ring in [09](09-bob-models.md). A dropped idea can come back later as a new unit. |
| Thorough | Reproduce first (a replay or a failing test), then fix. Every session starts and ends on a green [health check](#health), and an independent Critic reads every PR. Code is written for change: data over code, as with materials. |
| Transparent | Draft PR from the first push, the studio page, one file per unit with a log, nothing done off the record. |
| Documented | Decisions as short records in `docs/decisions/`; design docs updated in the same PR as the change; the concept doc kept in step. |

And three of its own:

- **Never blocked on the producer.** Anything that needs you is an **ask** with a default. Work carries on with the default where that's reversible; it waits only on calls that are yours (taste, direction, milestones, the harness's own rules).
- **The producer's time is the scarcest thing.** Every playtest request says exactly where to go, what to try and what to look for, and takes a few minutes, not a session.
- **Fun is measured, not assumed.** Your ratings are tracked per feature over time, and bots measure what can be measured (can it be finished, how much slack is in the hard jump, how much of Bob gets lost).

## What's in the repo

```
studio/
  README.md             how to read this folder (short; points here)
  producer.md           your settings: autonomy level, standing rules, taste notes
  direction.md          where we're going now: current milestone, priorities, what's off the table
  milestones/
    m1-green-alpha.md   scope, exit criteria, the units in it
  work/
    split-action.md     one file per unit of work (below)
    …
  asks/
    split-direction.md  one file per question waiting on the producer
  playtests/
    2026-10-21-split-action.md   your reports, and the Tester's
  board.ts              generates the board from the files above + open PRs
scripts/
  health/
    health.ts           the health check: runs every check, prints the report
    checks/             one file per check, grouped in tiers (see Health)
docs/
  decisions/
    2026-10-17-studio.md        one record per decision
.claude/
  settings.json         the session start hook: install, then a quick health check
  agents/               one file per role: its brief, tools and limits (a Claude Code subagent definition)
  skills/               the commands: go, director, feedback, status
.github/
  pull_request_template.md
```

Why files and not GitHub issues or a project board: they're versioned and reviewed in the same PR as the work, any session reads them without an API, they can't drift from the code, and observers see them in the repo. GitHub is used where it's better: **PRs** are the record of every unit and the in-flight signal, and **issues** are only an inbox for feedback sent from a build. The Director moves an issue into the files and closes it.

### Main is the truth

The next session reads main and nothing else, so **no session ends with state that exists only on a branch**. A session's PR is a working space and a record: it opens as a draft so the work shows while the session runs, and it's merged before the session ends. Sessions don't continue each other's branches; a session picks up from what's on main.

How every session ends:

| Outcome | What lands on main |
|---|---|
| **Done** | The work, with the unit set to `done` (or `playtest`). |
| **Partly done** (a stop sign, or out of budget) | The finished, green part. Code that isn't ready to play lands **switched off**: behind a flag (`?flags=split`) or not yet wired into the game, so main stays playable and a preview can still turn it on. The rest becomes new units, and the handoff goes in the unit's log. |
| **Stuck** (can't be made green) | The broken code is taken out of the PR, back to the last green commit (or all of it). What lands is the handoff: what was tried, what was learned, and a link to the last commit of the attempt, which stays on GitHub so the next try can start from it. The unit goes back to `ready` with the handoff, or to `dropped` if the attempt showed it isn't worth doing. |
| **Waiting for you** (a gated PR) | Nothing yet. This is the only kind of PR left open between sessions. It's labelled `gated`, the board shows it under *Needs you*, and no unit builds on it until it's merged. Ungated work in the same session goes in a separate PR so it isn't held up. |

Merging means CI is green on the PR's latest commit, the end-of-session health check is green, and the Critic has no blocking findings. Then the session squash-merges, as `CLAUDE.md` requires. If main has moved on, the session merges main into its branch and runs the checks again first. The session waits for CI by watching its PR, not by polling.

Merging at the end of every session is what makes this work. You still see everything: the PR, the preview, and the report. Each unit is small, and the next session starts with the health check, so a bad merge is caught early and is cheap to revert. If you'd rather review before merge, see [Autonomy levels](#autonomy-levels) for what that costs.

### One file per unit

Why one file per unit and per ask, never a shared list: parallel sessions on separate branches would conflict over a shared file on every merge. The board that lists them all is generated, never edited.

### A unit of work

`studio/work/<slug>.md`. The slug is the ID (like `split-action`): readable, and parallel sessions can't collide on a counter.

```markdown
---
title: Split action
kind: build            # think | shape | spike | build | fix | test | tool | tidy | release
role: engineer         # who does it
size: M                # S = half a session, M = one; nothing bigger starts
status: ready          # idea | shaped | ready | doing | review | playtest | done | dropped
milestone: m1-green-alpha
needs: [split-direction]          # asks or units that must land first
pr: 41                            # set when it starts
scenario: split-gate              # where a play tester goes to see it
---

## Why
Raised in playtest: leave a piece on a plate and go on. Pieces are the core of World 1's puzzles.

## Done when
- E / X or a swipe splits the piece you steer into two, cut across your direction of travel.
- Q / R switches pieces; the camera follows the steered one.
- Behaviour tests: particles conserved; a split piece can hold the plate in `split-gate`.

## Not this
Which way the cut goes on touch (ask: split-direction). HUD for pieces (own unit).

## Log
- 2026-10-21 started, #41. Cut plane from velocity; touch cut deferred to the ask.
- 2026-10-21 review: Critic found pieces under 20 particles can't be steered; min size added.
- 2026-10-21 playtest requested: scenario split-gate.
```

The statuses:

```
idea ─► shaped ─► ready ─► doing ─► review ─► (playtest) ─► done
   └──────────┴────────┴────────┴─────────┴──────────────► dropped (with why, and what was learned)
```

- **idea**: a line of why. Anyone can add one. Ideas that aren't units yet stay in [10 Ideas](10-ideas.md).
- **shaped**: has *Done when* and *Not this*, a size, and a role.
- **ready**: nothing in `needs` is open.
- **doing**: a session has it; there's a draft PR. Only seen on the board while a session runs: by the end it has moved on.
- **review**: the PR is out of draft; checks and the Critic are running. Also only while a session runs.
- **playtest**: merged, waiting for a producer playtest when the unit is about feel. Only some units need this.
- **done** or **dropped**, always with a last log line saying why.

Kinds, so the board can balance them: **think** (ideas, a design conversation), **shape** (turn an idea into specs and units), **spike** (a throwaway prototype answering one question), **build**, **fix**, **test** (bots, regression runs), **tool** (for you or for us), **tidy** (docs, dead code, harness upkeep), **release** (an alpha or beta).

### An ask

`studio/asks/<slug>.md`: a question only the producer can answer.

```markdown
---
title: Which way does a swipe split Bob?
from: designer
blocks: [split-action]
default: Across the swipe, halves by area.
expires: after 3 sessions      # then the default stands, and the unit says so
gated: false                   # true: nothing proceeds without you
---
Context in five lines, a picture or a preview link, and the options with a recommendation.
```

Asks are answered in a session (`/director` answers them; the Director also offers the open ones at the start of any session) or on GitHub, as a comment on the PR that raised them. Gated asks (taste, direction, milestones, the harness's own rules) never expire.

### Decisions

`docs/decisions/<date>-<slug>.md`, a few short sections: the question, what we chose, what else was considered, what it means for later, and its status (`accepted`, or `superseded by …`). Written whenever a choice would be expensive to reverse or likely to be asked about later: "why is Bob goo" is the model. The design docs stay as the description of what *is*; decisions keep the *why* and the history.

### The producer file

`studio/producer.md` is yours and the Director's:

- **Autonomy level** (below).
- **Standing rules** you've given ("never change Bob's colour without asking", "prefer forgiving over precise").
- **Taste notes**: what the Director has learned from your feedback, each with where it came from ("likes crumbs-as-skill: playtest 2026-10-02"). Designers read this before shaping anything. You can correct it.

## The roles

Each role is a brief in `.claude/agents/<role>.md`: what it's for, what it reads first, what it may change, and what done looks like. It's written as a Claude Code subagent definition, so the same file serves both ways a role is used (see [Invocation](#invocation)).

| Role | Does | Reads first | May change | Never |
|---|---|---|---|---|
| **Director** | Your one point of contact. Asks what you mean, routes it, keeps `direction.md` and the board, picks what `/go` does, sizes and splits, keeps the docs in step, runs retros. | `producer.md`, `direction.md`, the board, open PRs, feedback issues | `studio/`, `docs/decisions/`, routing | Write game code. Decide taste for you. |
| **Designer** | Mechanics, levels, puzzles, difficulty, pacing, what fun is. Drills into your intent. Shapes ideas into units with *Done when*, and writes the playtest questions. | `docs/01`, `08`, `10`, `11`, taste notes, playtests | design docs, `studio/work/`, level and scenario data | Ship code beyond level data. |
| **Muse** | Divergent thinking. Pitches what nobody asked for, challenges assumptions ("does Bob need to jump at all?"), starts from what only this sim can do. Output is idea cards and spike proposals, never decisions. | the sim and Bob docs, `10-ideas`, recent playtests | `docs/10-ideas.md`, new `idea` units | Shape or build. |
| **Art director** | The look: colour language, lighting, Bob's painter, consistency with the stills' kit. Reviews anything visual against golden images. | `docs/02`, `11`, `kit/`, `draw.ts` | the kit, `packages/render`, palettes, golden images | Change the colour language without a gated ask. |
| **Planner** | Turns a shaped design into a technical approach and session-sized units with order and dependencies; spots the risky unknown and puts a spike in front of it. | design docs, the code it touches, `03`, `04` | `studio/work/`, `docs/decisions/` | Build. |
| **Prototyper** | Spikes: fast, throwaway, one question each, with a kill criterion. Answers with a verdict and what was learned. | the unit's question | `prototypes/NN-*` only | Import spike code into packages or the game; it's rebuilt properly if it survives. |
| **Engineer** | Production code: packages, the game, fixes. Reproduces before fixing. Tests with the change. Designs for extension. | `CLAUDE.md`, the code, the unit | `packages/`, `game/`, tests | Change design intent silently; it raises an ask or a note. |
| **Toolsmith** | Tools for you (tweak panels, level and puzzle editor, scenario links, replay viewer) and for us (the board, bots' harness, render scripts). | the formats in `04`, the board | `tools/`, `studio/board.ts`, editor prototypes | Change game rules to suit a tool. |
| **Tester** | Automated play: scripted and bot runs, replays of your runs as regression tests, invariants and fuzzing, performance budgets, filmstrips, browser smoke tests. Writes playtest reports. | the unit, scenarios, replays | `tests/`, `studio/playtests/`, bot code | Fix what it finds (it files `fix` units with a replay). |
| **Critic** | Independent review of every PR before merge: correctness, the conventions in `CLAUDE.md`, determinism, tests that test the claim, docs in step, size. Fresh eyes: it never sees the author's reasoning, only the diff and the unit. | the diff, the unit, `CLAUDE.md` | PR comments | Push code. |
| **Release** | Builds: preview scenarios and handoff cards for each PR, alpha and beta builds at milestones, changelogs and release notes. | the milestone, merged units | `.github/workflows/`, `game/scenarios/`, release notes | Cut a milestone build without you. |

Roles are added when the work needs them, by a decision record and a PR: an **Audio** role in phase 3 is the likely first. A role that keeps being skipped is retired the same way.

## Invocation

There are three ways a role runs, picked by what the work needs.

1. **Wear the hat (in-thread).** The session reads the role's brief and does the work itself. Used for the main work of a unit: building, shaping, a design conversation with you. The context is kept, which is what a long piece of work needs, and nothing is spent starting a fresh agent.
2. **Subagent (isolated).** The session starts the role as a subagent, with only a brief: the unit, the diff, pointers to files. It comes back with a report. Used when **independence** matters (the Critic must not inherit the author's assumptions; the Muse shouldn't be anchored by the plan), or when the output is bulky and only the conclusion matters (the Tester's runs, a search across the code). The subagent definition limits its tools: the Critic and Muse can't edit, the Tester can run commands but only writes reports.
3. **Parallel sessions (fan-out).** For `/go 3` and independent ready units, the Director starts separate cloud sessions, one per unit, each on its own branch with its own PR. Used only when units don't touch the same files. This is a later step (see [Building the studio](#building-the-studio)); one unit at a time comes first.

What every session does on `/go`:

0. **Health check.** `pnpm health`. If it's red, stop here: this session is now a `fix` unit for the health check (see [Health](#health)).
1. **Sync.** Read `producer.md`, `direction.md`, the board, open PRs and their reviews, CI on main, and new feedback issues.
2. **Pick** the next unit by the [order below](#what-go-picks), and say which and why in a few lines.
3. **Claim.** Set the unit to `doing`, push, and open a draft PR at once, so it's visible in flight. The branch is whatever the session gets; the unit records the PR.
4. **Work** in the role's hat. Spikes state the question and kill criterion first; fixes reproduce first.
5. **Check.** `pnpm health --quick` as often as useful while working, and the Tester for anything that changes play.
6. **Review.** The Critic as a subagent. Its blocking findings are fixed before the PR leaves draft; the rest are answered on the PR.
7. **Ship.** PR description per the template: the unit, what changed, decisions, how to test (the preview link to the scenario, what to look for), follow-ups. Update the unit's log and status, any docs, the concept doc if it's affected.
8. **Health check again.** `pnpm health` on the final commit, with everything pushed. Its summary goes in the PR description as proof.
9. **Merge**, unless the PR is gated: CI green, then squash-merge (see [Main is the truth](#main-is-the-truth)). If it can't be made green, the broken part comes out and the handoff lands instead.
10. **Report** to you in five lines or so: what was done, the link, the health result, what's waiting on you.

If there's budget left after an S unit, the session may take a second S unit, from a clean point.

### What `/go` picks

Top of this list first:

1. **Main is broken**: the start-of-session health check is red, CI on main is red, or a deploy failed. This isn't a choice: the health check decides it before anything else is read.
2. **Your input that hasn't been handled**: feedback issues, PR comments from you, answered asks that unblock something.
3. **Open PRs** that need fixing or finishing.
4. **The current milestone's next ready unit**, riskiest first: the unit with the biggest unknown, or a spike in front of it.
5. **Shaping** when fewer than about three units are ready: the Designer and Planner turn the next ideas into units.
6. **Balance**: after about four build units in a row, a test or tidy unit. After a milestone, a retro.
7. **Nothing obvious**: the Muse pitches, or the Tester goes bug-hunting.

You can always steer: `/go fix the jump`, `/go something small`, `/go think`.

### Sizing and spirals

- **Sized before it starts.** S is half a session, M a whole one. The Planner splits anything that looks bigger. A useful check: an M touches one package plus its tests and docs, and has at most one real unknown.
- **Stop signs** while working: the context has been compacted once and the work isn't near done; two approaches have failed; the diff is heading past about 800 lines; the unit's *Done when* turns out to be wrong.
- **On a stop sign**, the session stops cleanly: commits what works (or keeps it on the branch, if it doesn't), writes a handoff in the unit's log (what was tried, what was learned, where it stands), splits the rest into new units, and says so in the PR and to you. A split is a normal outcome, not a failure.

### Isolation

- **Context**: one unit per session. Subagents start fresh with a brief, so a review or a pitch isn't shaped by the author's reasoning.
- **Tools**: each role's subagent definition lists only the tools it needs.
- **Code**: one branch and PR per unit; spikes live only in `prototypes/`, and nothing outside imports them; parallel writers use separate sessions (or worktrees), never the same checkout.
- **Authority**: the *May change* and *Never* columns above, plus gated calls that only you make. The Critic checks a PR stays inside its unit's role and scope.

## Health

`pnpm health` answers one question: is this repo ready to develop on? It runs at the start of every session, at the end of every session and in CI. All three run the same script, so a session and CI can't disagree about what "healthy" means.

### What it checks

Checks are grouped in tiers and run in order. A tier that fails stops the run, because there's no point type-checking without dependencies.

| Tier | Checks (to start with) | Typical failure it catches |
|---|---|---|
| **1. Tools** | Node is the version the repo pins; pnpm matches `packageManager`; git; Chromium is where Playwright looks (once browser tests exist) | A fresh container with the wrong Node, or a missing tool |
| **2. Dependencies** | Install from the lockfile (`--frozen-lockfile`); `node_modules` matches the lockfile; every workspace package resolves | "tsc not found" because nothing was installed, as happened when this plan was written |
| **3. Repo** | On a session branch, not `main`; no conflict markers; how far behind `main` the branch is; at the end, also: tree clean, everything pushed, a PR open | Work that wasn't pushed before the container was thrown away |
| **4. Code** | `pnpm typecheck`, `pnpm test`, `pnpm build:site`; the conventions in `CLAUDE.md` that a script can test, e.g. no `Math.random()` in `packages/sim` or `packages/bob`, no DOM in either | Main red, or a convention quietly broken |
| **5. Studio** | Every unit, ask and milestone file parses, with valid fields and statuses; every `needs` exists; the board generates; links between docs resolve; scenarios load; golden replays still give their recorded outcome | A typo in a unit's status that hides it from the board |
| **6. Budgets** (later) | The sim step and render stay within their time budgets on the benchmark scene | A change that quietly costs 3 ms a frame |

- **Quick and full.** `pnpm health` runs everything; it should take a couple of minutes at most. `pnpm health --quick` skips the slow checks (build, replays, budgets) for use while working. Sessions start and end on the full run, and so does CI.
- **Output.** One line per check (pass or fail, and its time), then for each failure the command that reproduces it and a hint at the usual cause. `--json` prints the same as data, for the board and the PR description.
- **Automatic.** A session start hook in `.claude/settings.json` installs dependencies and runs the quick check, so every session (even one that isn't `/go`) sees the repo's state first thing. The skills then require the full run before any work.

### When it's red at the start

The session doesn't do what it was asked. It says so in one line, then works out where the failure comes from:

- **Main is broken** (code, tests, studio files). The session becomes a `fix` unit for that check: it reproduces the failure, fixes it, opens a PR, runs the end-of-session health check and stops there. It also asks why CI didn't catch the problem, and if CI couldn't have, adds a check so it would next time.
- **The environment is broken** (a tool missing or the wrong version in the container). If the repo can fix it (the session start hook, a pinned version), that's the fix. If it needs a change to the cloud environment's settings, which live outside the repo, the session tells you exactly what to change and stops.
- **The check itself is wrong** (flaky, or out of date). A flaky check is a bug, fixed like any other. The check is never deleted or skipped to get green.

You can override with `/go anyway`. The session then works with the failure named in its PR and its report, and the next session starts by fixing it.

### When it's red at the end

A session never leaves main worse than it found it, and never leaves its work stranded on a branch. CI runs the same check, so a red PR can't merge. If the unit's code can't be made green, it comes out of the PR (back to the last green commit), and what merges is the handoff: which check fails, what was tried, and a link to the attempt. See [Main is the truth](#main-is-the-truth).

### Keeping it up to date

The health check is only useful if it grows with the repo, so these rules apply:

- **Whatever a PR adds, it checks.** A PR that adds a tool, a dependency, a file format, a generated file or a convention also adds a check for it. The Critic looks for the missing check.
- **Every surprise becomes a check.** A failure a session hits that the health check didn't predict gets a check in the same PR as the fix. The first one is in this plan: missing dependencies.
- **Checks can fail.** Each check has a test that feeds it a broken fixture and expects a failure, so a check that always passes is caught.
- **Slow or noisy checks are fixed.** Each milestone retro looks at how long the run takes and which checks have been noisy.

### Autonomy levels

Set in `producer.md`.

| Level | Merges | You see |
|---|---|---|
| **Review first** | You merge every PR. Units that build on an unmerged PR are blocked, so `/go` will often find nothing ready until you've merged. | Every PR. |
| **Studio merges** (the default) | The studio squash-merges its own PR at the end of the session, as in [Main is the truth](#main-is-the-truth), unless it's gated. | Gated PRs and playtest requests. Everything else is merged, and visible on the studio page and in the reports. |
| **Autopilot** | As above, and `/go` may run as a cloud scheduled task (say nightly) within a budget you set. | A digest per run. |

**Gated**, at any level: changes to direction, milestones, the colour language or Bob's character, the harness's own rules, cutting an alpha or beta, and anything an ask marked gated. Gated PRs are labelled `gated` and wait for you. Each one is self-contained, so nothing else waits behind it.

## Builds and playtesting

### Channels

| Build | Where | When |
|---|---|---|
| **Preview** | `…/preview/pr-N/` (exists today) | Every PR. |
| **Latest** | `…/pixelbob/game/` | Every merge to main. |
| **Alpha / beta** | `…/pixelbob/builds/alpha-1/`, kept forever | When you approve a milestone build; a tag cuts it. |

- **Alpha**: the milestone's mechanics are all playable end to end; content can be rough and placeholder.
- **Beta**: the milestone's content is complete; only fixes and polish follow.
- Each comes with release notes: what's in, what to play, what's known broken, and a short playtest script.

### Scenarios: putting you where the change is

A **scenario** is a small data file in `game/scenarios/`: a level, where Bob starts, his size, temperature and pieces, any tweaks, the camera, and a **handoff card**: what changed, what to try, what to look for, known issues. `?scenario=<id>` starts the game there (the Bob playground's `?at=<x>` is the seed of this). Every PR that changes play links its scenario from the PR description: one click from GitHub, or the phone, into the right spot.

### Feedback: with a replay attached

The build has a feedback button (and a key). It opens a short form: fun, difficulty (too easy / right / too hard), frustration, and free text, prefilled with the build, the scenario and the questions from the handoff card. It also attaches a **replay**: the inputs you pressed, frame by frame. The sim and Bob are deterministic, so the replay plus the build reproduces exactly what you saw, which makes "it did something weird on the second jump" a test case rather than a mystery.

Sending it opens a prefilled GitHub issue (no server needed), or copies the text to paste into a session with `/feedback`. The Director triages it into a playtest report, the unit, new `fix` units with the replay attached, and taste notes.

### Automated playtesting

The Tester's kit, all running in Node except the smoke test:

- **Replays as regression tests.** Your replays and the Tester's are kept with the expected outcome (finished, % of Bob home, time). If a change alters an outcome, the PR says so: sometimes that's the point (a level got easier), sometimes it's a bug.
- **Bots.** Scripted input for set pieces, and a search bot that explores input sequences in the deterministic sim to prove a level can be finished, find skips, softlocks and unintended routes.
- **Forgiveness.** For each hard moment, how far the bot's timing and position can be off and still succeed: frames of slack on the jump, pixels of margin on the ledge. That's a number for "too precise" that tracks your difficulty ratings.
- **Invariants and fuzzing.** Particles conserved, no NaN, nothing tunnels through rock, the step stays within its time budget; random input soaks to shake out crashes.
- **Filmstrips.** Key frames of a run rendered to a PNG strip (the stills' renderer already runs headless). Agents look at them; they go in PRs so you can see a change without playing it.
- **Browser smoke test.** Playwright loads the preview, runs a replay, checks for errors and frame rate.

What bots can't judge is whether it's fun: that's what your playtests are for, and the handoff card spends your time only on that.

## Tools for the producer

The Toolsmith's queue, prioritised by the Director like everything else:

- **Tweak panels** with every number and settings saved in the URL (the Bob playground has this), extended to levels.
- **Scenario links** you can make yourself: "start me here" from any moment in a build.
- **Level and puzzle editor** in the browser: paint materials and place things on the format in [04](04-tech-and-toolchain.md#level-format), play it at once, and share it as a link or submit it as a file the studio picks up.
- **Replay viewer**: watch your runs and the bots' side by side.
- **Remix**: copy any level or scenario as the start of a new one.

## Transparency

- **GitHub**: every unit is a PR: draft from the first push, merged by the end of the session. Labels by kind and role, plus `gated` and `playtest`.
- **The studio page** on Pages (`…/pixelbob/studio/`), regenerated on every merge and whenever a PR opens or closes: in flight, needs you (asks and playtest requests), next up, milestone progress, recently done and dropped, decisions, builds, and your fun and difficulty ratings over time. Linked from the site index above the prototypes.
- **`/status`** prints the same in a session.

## Building the studio

The order it gets built in, each a unit of its own. The first three make the harness usable; the rest come in as they're needed, so phase 3 starts as soon as possible.

1. **Health check (S).** `scripts/health/` with tiers 1 to 4, the session start hook, CI switched to `pnpm health`, and a test for each check. It comes first because every unit after it starts and ends with the check.
2. **Folder and board (S).** `studio/` with its formats, `producer.md` at "studio merges", `direction.md`, the first milestone, units for everything below, `board.ts`, the first decision record, and the studio tier of the health check.
3. **Roles and commands (M).** `.claude/agents/` briefs, the `go`, `director`, `feedback` and `status` skills, the PR template, labels, the `CLAUDE.md` pointer.
4. **Studio page (S).** The board on Pages, rebuilt on merges and PR events.
5. **Game shell and scenarios (M).** `game/` (the real game, distinct from the prototypes) with `?scenario=`, handoff cards, and the feedback button.
6. **Replays and the Tester's kit (M).** Input recording and playback, the headless runner, regression replays, filmstrips.
7. **Bots and forgiveness (M, spike first).** The search bot and the slack measure.
8. **Release (S).** Tag-cut alpha and beta builds under `/builds/`, release notes.
9. **Fan-out (S, later).** Parallel sessions for independent units.

Then the Director takes phase 3: the first milestone, an alpha of The Green.

## Open questions

- **Merging.** The plan has the studio merge its own green PRs at the end of each session, so main always holds everything. Gated PRs wait for you. Is that right, or do you want to review first, at the cost of `/go` often being blocked until you merge?
- **Where feedback lands.** A prefilled GitHub issue needs you signed in on the device; copy-and-paste into `/feedback` works everywhere. Both are planned; which do you expect to use from a phone?
- **Schedule.** Should autopilot exist at all, or is `/go` always by hand?
