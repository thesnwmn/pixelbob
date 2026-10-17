# The studio

How a team of agents builds Pixelbob from here, with one human as producer and play tester. This is the plan for the harness ("the studio"): what it's made of, where it keeps its state, who's in it, how each role is invoked and kept apart, and how builds reach the play tester. The [producer guide](producer-guide.md) is the same thing from the producer's side: what you type, what you get back.

**Status:** the first milestone's harness is built (m0-studio, [retro](sessions/2026-10-17-2031-m0-retro.md)): the [health check](#health), the [studio's files and the board](#the-studios-state) (`pnpm board`), [the roles](#the-roles) and the commands (`/go` and the rest, in `.claude/`), the [docs-in-step checks](#keeping-docs-and-the-studio-in-step), the [gate](#github) and the [studio page](#transparency). The rest of [Building the studio](#building-the-studio) comes in with the game's milestones, as they need it.

## TL;DR

```
 producer ──"/go", "/needs-me", "/director …"──►  Director  ── reads ──►  studio/ (the board, on main)
    ▲                                                  │                        + open PRs + open issues (bugs)
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
- **Your calls in one place.** `/needs-me` gathers everything waiting on you (questions, gated PRs, playtests) and goes through it with you, one item at a time.
- **"go" is enough.** `/go` makes the Director pick the most valuable next unit from the board, do it, ship it as a PR and tell you what it needs from you, if anything. `/next` shows what `/go` would pick, and the alternatives, without doing anything.
- **Docs can't drift.** Every PR updates the docs and studio files its change affects, in the same PR. The health check fails a PR that changes mapped code without touching its docs, unless the PR says why none are needed.
- **A unit fits in a session.** Every unit is sized S (half a session) or M (one session) before it starts. Anything bigger is split first, and anything that starts to spiral is stopped, handed off and split.
- **All state is in the repo.** `studio/` holds the board as one file per unit, the producer's settings, the asks waiting on you, milestones and playtest reports. Decisions go in `docs/decisions/`. A session's memory is the repo, so nothing depends on a conversation surviving.
- **Main is the truth.** Every session ends with its work merged to main, finished or not: unfinished code lands switched off, and a failed attempt lands as a handoff note. The next session starts from main and nothing else. The only PRs left open between sessions are the ones waiting for your call.
- **Visible.** Every unit opens a draft PR as soon as it starts, so the work in progress shows on GitHub while the session runs. A generated **studio page** on Pages shows the board (in flight, needs you, next, milestone progress, done) and the sessions; decisions and builds are planned.
- **Playable.** Every PR that changes play gets a preview link that drops you straight into a **scenario** (a level, a place, Bob's state) with a card saying what changed and what to look for, and a feedback button that copies your notes, with an exact **replay** of what you did, to paste into `/feedback`.
- **Healthy in, healthy out.** Every session starts by running `pnpm health`, which checks the tools, dependencies, code and studio files. If it's red, that session's only job is to make it green. Every session that changes anything ends by running it again, as proof it left the repo in a good state. CI runs the same script. It grows with the repo.
- **Bots play too.** The sim is deterministic and runs in Node, so the Tester proves levels can be finished, measures how forgiving they are, replays your runs as regression tests and renders filmstrips the agents (and you) can look at.

## Where it runs

**Claude Code cloud sessions with GitHub access**, like the one that wrote this doc. There's no long-running agent, server or CLI. That shapes the whole design:

- **A session is the unit of execution.** You open one on the repo (claude.ai/code, on the web or the app), type a command, and it works until the unit is done. The container is thrown away afterwards, so anything worth keeping is pushed.
- **The repo is the only memory.** A new session knows what `CLAUDE.md`, `studio/` and the docs tell it, plus what it reads from GitHub (open PRs, reviews, issues, CI). So every session that changes anything ends by writing down where it got to, in its [session log](#session-logs).
- **The branch comes with the session.** Cloud sessions are given their branch name, so the studio never relies on branch names; a unit records its PR number instead.
- **GitHub is the shared surface.** PRs, reviews, CI and the preview builds are where you and the studio meet outside a session. A session can watch its own PR's CI and review comments while it's open; once it ends, the next `/go` picks up whatever happened.
- **The cloud gives a few extras for later:** starting parallel sessions (fan-out) and scheduled tasks (autopilot). Neither is planned now; both would fit without changing anything else.

Nothing here assumes a session lives longer than one unit, so moving to a long-running agent later would change the invocation, not the formats: it would read and write the same `studio/` files and PRs.

## Principles

What the brief asks of the studio, and what each turns into here.

| Asked | So the studio |
|---|---|
| Creative | Tries ideas as **spikes** in `prototypes/` before committing to them. The **Muse** exists to suggest things nobody asked for. |
| Original | The Muse is briefed to start from the sim and Bob ("what can only happen here?"), not from other games. Prior art ([Prior art](../docs/prior-art.md)) is a check, not a source. |
| Agile | Plans only the current milestone in detail and the next one in outline. Units are shaped just before they're needed. The harness itself is reviewed at every milestone. |
| Brave | Every spike states its **question and its kill criterion before any code**. Dropping is a normal outcome, recorded with what was learned, like the lattice and ring in [Bob models](../docs/bob-models.md). A dropped idea can come back later as a new unit. |
| Thorough | Reproduce first (a replay or a failing test), then fix. Every session starts and ends on a green [health check](#health), and an independent Critic reads every PR. Code is written for change: data over code, as with materials. |
| Transparent | Draft PR from the first push, the studio page, one file per unit with a log, nothing done off the record. |
| Documented | Decisions as short records in `docs/decisions/`; design docs updated in the same PR as the change; the concept doc kept in step. |

And three of its own:

- **Never blocked on the producer.** Anything that needs you is an **ask** with a default. Work carries on with the default where that's reversible; it waits only on calls that are yours (taste, direction, milestones, the harness's own rules).
- **The producer's time is the scarcest thing.** Every playtest request says exactly where to go, what to try and what to look for, and takes a few minutes, not a session.
- **Fun is measured, not assumed.** Your ratings are tracked per feature over time, and bots measure what can be measured (can it be finished, how much slack is in the hard jump, how much of Bob gets lost).

## Repo structure

The whole repo, as it is and as it's planned to grow. **`docs/` is the game** (what it is, how it works, and why). **`studio/` is how it gets made** (this harness, the board, the producer's files). The code is in the folders between them.

```
pixelbob/
  README.md                 what the game is, how to run things
  CLAUDE.md                 conventions every session follows

  docs/                     THE GAME: design and tech, describing what is
    README.md               index and TL;DR
    game-overview.md, art-direction.md, simulation.md, bob.md, worlds.md, …
                            the design docs: flat, named by subject, no numbers
    decisions/              one record per decision: the why and the history
    img/                    pictures the docs use

  studio/                   HOW IT'S MADE: the harness and its state
    README.md               this doc: how the studio works
    producer-guide.md       the producer's side
    producer.md             the producer's settings, standing rules, taste notes
    direction.md            current milestone, priorities, what's off the table
    milestones/             one file per milestone: scope, exit criteria
    work/                   one file per unit of work
    asks/                   one file per question waiting on the producer
    playtests/              the producer's reports, and the Tester's (format in the `feedback` skill; none yet)
    sessions/               one log per session: what it did, what was said, tried and learned
    board.ts                reads the files above and generates the board (`pnpm board`)
    page.ts                 the studio page: the board and the sessions as HTML, for Pages
    doc-map.json            which docs describe which code, for the docs-in-step check

  packages/                 shared libraries the game is built from
    sim/                    the world grid; no DOM
    bob/                    Bob; no DOM
    render/                 the WebGL2 renderer and the cells-to-textures pass
    play/                   (planned) input, recording and replaying, the headless runner, bots; no DOM
    levels/                 (planned) the level format: load, save, decorate

  game/                     the game itself: a Vite app, built to …/pixelbob/game/
    src/                    the scenario format, playing one, the feedback button (planned: title, map, HUD, saves)
    levels/                 (planned) the levels: material PNGs plus entity JSON
    scenarios/              start points with handoff cards, for `?scenario=`
    replays/                (planned) recorded runs with their expected outcomes; the health check replays them

  prototypes/               spikes: throwaway, one question each
    00-stills/ 01-sandbox/ 02-bob/ …
  tools/                    (planned) producer tools as Vite apps: level editor, replay viewer
  concept/                  the concept doc on Pages

  scripts/                  repo scripts
    build-site.mjs          assembles the Pages site
    health/                 the health check and its checks (`pnpm health`)
  .claude/                  the studio's wiring
    settings.json           the session start hook
    agents/                 one brief per role
    skills/                 the commands: go, next, needs-me, director, feedback, status
  .github/
    workflows/              CI (`pnpm health`, and nightly), the PR title check, the gate check, the in-step check, label sync, Pages and the studio page, previews (and planned: releases)
    gated.json              the files whose changes wait for the producer
    labels.json             the repo's labels, synced to GitHub
    pull_request_template.md
    ISSUE_TEMPLATE/bug.yml  the bug form
```

What goes where:

- **`docs/` describes what is; `studio/` holds what's being done and what's next; `docs/decisions/` keeps why.** A design doc is updated in the same PR as the change it describes. Planning never goes in `docs/`; `roadmap.md` stays as the history of the phases and points to `studio/` for what's next.
- **Design docs are named by subject, not numbered** (`bob.md`, `worlds.md`). Numbers only recorded when a doc was written: they weren't a reading order, renumbering breaks links, and parallel branches would race for the next one. Reading order lives in the table in `docs/README.md`. A subject that outgrows one doc gets a folder of the same name beside it (say `docs/worlds/` when each world's levels need their own pages), and the doc becomes its summary.
- **Code that ships** lives in `packages/` and `game/`. Nothing there imports from `prototypes/` or `tools/`. A prototype that survives is rebuilt properly, not moved.
- **Content is data**, beside the game that uses it (`game/levels/`, `game/scenarios/`, `game/replays/`), so a designer or the producer can change it without touching code.
- **`packages/` stays renderer-agnostic** except `render/`, so the sim, Bob and the bots run in Node and in workers.
- **A new top-level folder is a decision**: it gets a record and goes in the map above. The health check fails on a top-level folder the map doesn't list, so the map can't go stale.

### The studio's state

The files in `studio/` are the backlog and everything around it. Why files and not GitHub issues or a project board for the backlog: they're versioned and reviewed in the same PR as the work, any session reads them without an API, they can't drift from the code, and observers see them in the repo ([Backlog in files](../docs/decisions/2026-10-17-backlog-in-files.md)). GitHub is used where it's better (see [GitHub](#github)): **PRs** are the record of every unit, and **issues** are for things that are wrong.

Each file starts with front matter: `key: value` lines between `---`, where a value is text, a number, `true` or `false`, or a list `[a, b]`, and `#` starts a comment. Fields and statuses are checked by `studio/board.ts`, which the health check runs, so a file that doesn't follow its format, or names a unit, ask or milestone that doesn't exist, turns the check red.

### The board

`pnpm board` prints the board, generated from the files and never committed: the milestones and how far along each is, what needs you (open asks, gated PRs, playtests), what's in flight, then the units that are ready, shaped and ideas, and what's done and dropped. `pnpm board --github` adds open PRs and bugs from GitHub, and `--json` prints the same as data. It's what `/go`, `/next` and `/status` read.

### Main is the truth

The next session reads main and nothing else, so **no session ends with state that exists only on a branch** (or only in the container). What a session does on GitHub itself, an issue raised or a comment on a PR, is already landed: it isn't in the container. A session that changes nothing in the repo (`/next`, `/status`, a question answered) has nothing to land: no PR, no log, no end check. A session's PR is a working space and a record: it opens as a draft so the work shows while the session runs, and it's merged before the session ends. Sessions don't continue each other's branches; a session picks up from what's on main.

How every session ends:

| Outcome | What lands on main |
|---|---|
| **Done** | The work, with the unit set to `done` (or `playtest`). |
| **Partly done** (a stop sign, or out of budget) | The finished, green part. Code that isn't ready to play lands **switched off**: behind a flag (`?flags=split`) or not yet wired into the game, so main stays playable and a preview can still turn it on. The rest becomes new units, and the handoff goes in the unit's log. |
| **Stuck** (can't be made green) | The broken code is taken out of the PR, back to the last green commit (or all of it). What lands is the handoff, in the session log: what was tried, what was learned, and a link to the last commit of the attempt, which stays on GitHub so the next try can start from it. The unit goes back to `ready` with the handoff, or to `dropped` if the attempt showed it isn't worth doing. |
| **Waiting for you** (a gated PR) | Nothing yet. This is the only kind of PR left open between sessions. It's labelled `gated`, the board shows it under *Needs you*, and no unit builds on it until it's merged. Ungated work in the same session goes in a separate PR so it isn't held up. |

### PRs

A PR's title becomes the squash commit on main, so the titles are the project's history. Titles and descriptions are short: enough for you and the next session to understand what happened, and no more. `.github/pull_request_template.md` sets the shape:

- **Title**: `type(scope)!: Summary`, [conventional commits](https://www.conventionalcommits.org/) style, under about 72 characters, checked on every PR by the `pr-title` workflow. The summary says what changed in plain words, starting with a capital, with no full stop and no ticket numbers: `feat(bob): Split action, E / X or a swipe cuts the piece you steer`. Why: [PR titles](../docs/decisions/2026-10-17-pr-titles.md).
  - **Type**, by the unit's kind:

    | Type | For | Unit kinds |
    |---|---|---|
    | `feat` | Something new you can play, see or use | build, tool |
    | `fix` | Something that was wrong now isn't | fix |
    | `spike` | A throwaway prototype answering one question | spike |
    | `docs` | Design docs, the concept doc, plans | think, shape |
    | `test` | Bots, replays, regression runs | test |
    | `refactor` | The same behaviour, better code | tidy |
    | `perf` | Faster, within budgets | tidy |
    | `chore` | Dependencies, studio bookkeeping | tidy |
    | `ci` | Workflows | tidy |
    | `release` | Cutting an alpha or beta | release |
  - **Scope**, optional: one of `sim` `bob` `render` `play` `levels` `game` `stills` `sandbox` `playground` `concept` `studio` `health` `tools` `docs`. Leave it out when a PR spans areas. A PR that adds an area adds its scope to `.github/workflows/pr-title.yml`.
  - **`!`** when it breaks something saved: levels, replays, saves or scenarios. The Tester re-records what it breaks.
  - For example: `docs(studio): Plan the agent harness and the producer's guide`, `fix(bob): Pieces under 20 particles can be steered`, `spike(split): Does a swipe split better than a button?`, `feat(levels)!: Entities carry an id, so old replays need re-recording`.
- **Why**: one or two lines.
- **What**: up to five bullets, one line each.
- **Play** (if it changes play): the scenario link and what to look for.
- **Docs**: what was brought in step, or `none needed, because …`.
- **Health**: the one-line result of the end-of-session check.
- **Next**: follow-ups, if any.

Details belong in the session log, the unit's file, the docs, or a decision record, with a link from the PR. The Critic flags a PR that's grown wordy.

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

- **idea**: a line of why. Anyone can add one. Ideas that aren't units yet stay in [Ideas](../docs/ideas.md).
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
status: open                   # open | answered (with an ## Answer section) | expired
blocks: [split-action]         # each of these lists the ask in its needs
default: Across the swipe, halves by area.
expires: after 3 sessions      # then the default stands, and the unit says so
gated: false                   # true: nothing proceeds without you
---
Context in five lines, a picture or a preview link, and the options with a recommendation.
```

Asks are answered in a session (`/needs-me` walks through them; the Director also mentions how many are open at the start of any session) or on GitHub, as a comment on the PR that raised them. Gated asks (taste, direction, milestones, the harness's own rules) never expire.

### A milestone

`studio/milestones/<slug>.md`, like `m1-green-alpha`: `title` and `status` (`proposed`, `current`, `done` or `dropped`; one is current at a time) in the front matter, then *Why*, *Scope* and *Exit criteria*. A unit belongs to one with its `milestone` field, and the board counts how many of each milestone's units are done. New milestones and changes to them are gated.

### Direction

`studio/direction.md` names the current milestone in its front matter (`milestone: m0-studio`), then says in a few lines what's now, what's next, the priorities, and what's off the table. It's gated, like the milestones.

### Decisions

`docs/decisions/<date>-<slug>.md`, a few short sections: the question, what we chose, what else was considered, what it means for later, and its status (`accepted`, or `superseded by …`). Written whenever a choice would be expensive to reverse or likely to be asked about later: "why is Bob goo" is the model. The design docs stay as the description of what *is*; decisions keep the *why* and the history.

### The producer file

`studio/producer.md` is yours and the Director's. Its front matter holds the autonomy level (`autonomy: studio-merges` or `review-first`), and the rest is:

- **Autonomy level** (below).
- **Standing rules** you've given ("never change Bob's colour without asking", "prefer forgiving over precise").
- **Taste notes**: what the Director has learned from your feedback, each with where it came from ("likes crumbs-as-skill: playtest 2026-10-02"). Designers read this before shaping anything. You can correct it.

### Session logs

`studio/sessions/<date>-<HHMM>-<slug>.md`, with the UTC time the log is written, so a day's logs list in the order they happened (`board.ts` checks the name): one file per session that changes anything, written at the *Ship* step and merged in the session's own PR. The PR says *what* changed, in a few lines. The session log keeps what happened along the way, which would otherwise be lost when the container goes:

```markdown
---
date: 2026-10-21            # and the file is 2026-10-21-1430-split-action.md
command: /go
units: [split-action]
pr: 41
issues: [12]
session: https://claude.ai/code/session_…      # the transcript, for the producer
health: green at start, green at end
size: M planned; 45% of context, no compaction   # how big it really was
---

## Summary
Two or three lines: what the session set out to do and where it ended.

## The producer said
Your inputs and answers, close to your words, and what they decided.

## Done
What changed, with links to the PR, docs and decisions.

## Tried and dropped
Approaches that didn't work, and why, so nobody tries them again blind.

## Learned
About the code, the game, the tools, or your taste.

## Left for next time
The handoff: where things stand, what's next, what to watch out for.
```

- **Who reads them.** The next session, when it picks up a unit (its log links each session that touched it); the Critic, for context the diff can't give; the Director at retros; and you, or anyone, for the story behind a PR.
- **Sizing gets better.** The `size` line records how much of the session the unit really took. The Planner compares it with the estimate when sizing the next units.
- **Short.** A page at most. A long one means the session should have been split.
- **Every session that changes something writes one**, including a `/needs-me` or a `/director` conversation. Read-only commands (`/next`, `/status`) don't.
- **Unless the PR says why not.** `Session log: none, because …` in the PR description, like the `Docs:` and `Unit:` lines, for a PR whose story is already told: a `/feedback` session, whose playtest report is the record, or a one-line fix whose title says it all. Skipping is a written decision, never an oversight.
- **One file per session**, so parallel sessions never conflict. The unit's log gets a single line linking to it.
- **Enforced** like the docs: the health check fails a PR from a session that changes anything without adding a session log or saying why not.

The first one is this plan's own: [2026-10-17 studio plan](sessions/2026-10-17-1758-studio-plan.md).

## GitHub

The repo holds the plan and the work. GitHub holds the conversation around the work and enforces the rules, so they don't depend on an agent remembering them.

### Use

| Feature | For |
|---|---|
| **Issues** | **Things that are wrong**, never planned work: bugs and problems you hit in a playtest, failures the Tester's bots find, main going red overnight. Each has the build, the scenario and a replay where there is one. Ideas, features and tasks stay in `studio/`. |
| **Labels** | On issues: `bug`, plus `blocker` for a bug that stops a milestone build. On PRs: the unit's kind, `gated`, `producer-ok`, and `playtest` when it wants you to play it. They're a file, `.github/labels.json`, which the `labels` workflow syncs to GitHub when it changes on main. |
| **Issue form** | A bug form (`.github/ISSUE_TEMPLATE/bug.yml`) asking for the build, the scenario, what happened, what you expected, and the replay, for when you or anyone else file from GitHub directly. `/feedback` fills in the same fields. |
| **PRs** | One per unit; short (see [PRs](#prs)). `Fixes #N` closes the issue when it merges. Review comments are how you or anyone else can say something about a change after the fact; the next session reads them. |
| **Rulesets** on `main` | Enforce what `CLAUDE.md` asks: no direct pushes, squash merge only, and the CI health check, the PR title, gate and in-step checks must pass before anything merges. |
| **A gate check** | The `gate` workflow finds PRs touching gated files (listed in `.github/gated.json`: `studio/producer.md`, `direction.md`, milestones, `.claude/` and the health check's runner, CI and the in-step check, the colour language in `docs/art-direction.md`, the kit's palette, and the gate itself; why each, in [Gated files](../docs/decisions/2026-10-17-gated-files.md)), labels them `gated`, and stays red until the PR also has the label `producer-ok`. A PR labelled `gated` by hand is held the same way. Only you add that label. Code owners can't do this job: the studio's PRs are opened under your GitHub account, and GitHub doesn't let you approve your own PR. Since the studio uses your account, the check can't stop it from adding the label deliberately; it does stop a gated change slipping through by accident, which is the real risk. |
| **Releases** | Each alpha and beta is a tag and a GitHub Release: notes generated from the squash-merged PR titles since the last release (another reason the titles are short and plain), plus a link to the frozen build and a zip of it to play offline. |
| **Actions** | What's there now: CI runs `pnpm health` on every PR and push to main, and a **nightly health check on main** opens an issue if it fails (dependencies rot even when nobody pushes, and it uses no session budget); the PR title, gate and in-step checks; label sync; Pages, with the studio page rebuilt when a PR or issue opens or closes; PR previews. Planned: releases cut from tags; filmstrips posted in the preview comment on a PR. |
| **Pages** | The game builds, the prototypes, the concept doc and the studio page. |

Bugs don't need a unit file. A small one is fixed straight from its issue, and the PR closes it. A bug that needs shaping or splitting gets a `fix` unit linking the issue. The board lists open issues alongside units, so `/go` sees both.

### Don't use

- **GitHub milestones.** Our milestones are files with scope and exit criteria. A `blocker` label covers the one thing GitHub milestones would add: which bugs must be fixed before a build.
- **Projects.** A second board would drift from the first. The studio page is generated from the repo.
- **Discussions and the wiki.** Design lives in `docs/` and decisions in `docs/decisions/`. Discussions might be worth adding later, if outside play testers join.
- **Dependabot.** Dependency updates are `tidy` units, so they go through the health check and the Critic like any other change. The nightly health check notices when something's rotting.
- **Code owners and required approvals.** Both need a reviewer other than the PR's author, and the PRs are yours. The gate check does the job instead.
- **Auto-merge.** A session merges its own PR once it has seen CI go green. Auto-merge would let a PR merge after the session has ended and can't follow up, which breaks [Main is the truth](#main-is-the-truth).

## The roles

Each role is a brief in `.claude/agents/<role>.md`: what it's for, what it reads first, what it may change, and what done looks like. Each command is a skill in `.claude/skills/<name>/SKILL.md`, the checklist a session follows when the producer types it. It's written as a Claude Code subagent definition, so the same file serves both ways a role is used (see [Invocation](#invocation)).

| Role | Does | Reads first | May change | Never |
|---|---|---|---|---|
| **Director** | Your one point of contact. Asks what you mean, routes it, keeps `direction.md` and the board, picks what `/go` does, sizes and splits, keeps the docs in step, runs retros. | `producer.md`, `direction.md`, the board, open PRs, feedback issues | `studio/`, `docs/decisions/`, routing | Write game code. Decide taste for you. |
| **Designer** | Mechanics, levels, puzzles, difficulty, pacing, what fun is. Drills into your intent. Shapes ideas into units with *Done when*, and writes the playtest questions. | game overview, Bob, ideas, worlds docs; taste notes, playtests | design docs, `studio/work/`, level and scenario data | Ship code beyond level data. |
| **Muse** | Divergent thinking. Pitches what nobody asked for, challenges assumptions ("does Bob need to jump at all?"), starts from what only this sim can do. Output is idea cards and spike proposals, never decisions. | the sim and Bob docs, ideas doc, recent playtests | `docs/ideas.md`, new `idea` units | Shape or build. |
| **Art director** | The look: colour language, lighting, Bob's painter, consistency with the stills' kit. Reviews anything visual against golden images. | art direction and worlds docs, `kit/`, `draw.ts` | the kit, `packages/render`, palettes, golden images | Change the colour language without a gated ask. |
| **Planner** | Turns a shaped design into a technical approach and session-sized units with order and dependencies; spots the risky unknown and puts a spike in front of it. | design docs, the code it touches, simulation and tech docs | `studio/work/`, `docs/decisions/` | Build. |
| **Prototyper** | Spikes: fast, throwaway, one question each, with a kill criterion. Answers with a verdict and what was learned. | the unit's question | `prototypes/NN-*` only | Import spike code into packages or the game; it's rebuilt properly if it survives. |
| **Engineer** | Production code: packages, the game, fixes. Reproduces before fixing. Tests with the change. Designs for extension. | `CLAUDE.md`, the code, the unit | `packages/`, `game/`, tests | Change design intent silently; it raises an ask or a note. |
| **Toolsmith** | Tools for you (tweak panels, level and puzzle editor, scenario links, replay viewer) and for us (the board, bots' harness, render scripts). | the formats in the tech doc, the board | `tools/`, `studio/board.ts`, `scripts/`, `.claude/`, editor prototypes | Change game rules to suit a tool. |
| **Tester** | Automated play: scripted and bot runs, replays of your runs as regression tests, invariants and fuzzing, performance budgets, filmstrips, browser smoke tests. Writes playtest reports. | the unit, scenarios, replays | `tests/`, `studio/playtests/`, bot code | Fix what it finds (it opens an issue with a replay). |
| **Critic** | Independent review of every PR before merge: correctness, the conventions in `CLAUDE.md`, determinism, tests that test the claim, docs that still say true things, size. Fresh eyes: it never sees the author's reasoning, only the diff and the unit. | the diff, the unit, `CLAUDE.md` | PR comments | Push code. |
| **Release** | Builds: preview scenarios and handoff cards for each PR, alpha and beta builds at milestones, changelogs and release notes. | the milestone, merged units | `.github/workflows/`, `game/scenarios/`, release notes | Cut a milestone build without you. |

Roles are added when the work needs them, by a decision record and a PR: an **Audio** role in phase 3 is the likely first. A role that keeps being skipped is retired the same way.

## Invocation

There are three ways a role runs, picked by what the work needs.

1. **Wear the hat (in-thread).** The session reads the role's brief and does the work itself. Used for the main work of a unit: building, shaping, a design conversation with you. The context is kept, which is what a long piece of work needs, and nothing is spent starting a fresh agent.
2. **Subagent (isolated).** The session starts the role as a subagent, with only a brief: the unit, the diff, pointers to files. It comes back with a report. Used when **independence** matters (the Critic must not inherit the author's assumptions; the Muse shouldn't be anchored by the plan), or when the output is bulky and only the conclusion matters (the Tester's runs, a search across the code). The subagent definition limits its tools: the Critic and Muse can't edit, the Tester can run commands but only writes reports.
3. **Parallel sessions (fan-out).** For independent ready units, when you ask for several at once, the Director starts separate cloud sessions, one per unit, each on its own branch with its own PR. Used only when units don't touch the same files. This is a later step (see [Building the studio](#building-the-studio)); one unit at a time comes first.

What every session does on `/go`:

0. **Health check.** `pnpm health`. If it's red, stop here: this session is now a `fix` unit for the health check (see [Health](#health)).
1. **Sync.** Read `producer.md`, `direction.md`, the board, open PRs and their reviews, CI on main, and open issues.
2. **Pick** the next unit by the [order below](#what-go-picks), and say which and why in a few lines.
3. **Claim.** Set the unit to `doing`, push, and open a draft PR at once, so it's visible in flight. The branch is whatever the session gets; the unit records the PR.
4. **Work** in the role's hat. Spikes state the question and kill criterion first; fixes reproduce first.
5. **Check.** `pnpm health --quick` as often as useful while working, and the Tester for anything that changes play.
6. **Review.** The Critic as a subagent. Its blocking findings are fixed before the PR leaves draft; the rest are answered on the PR.
7. **Ship.** Bring the docs and the studio in step (see [Keeping docs and the studio in step](#keeping-docs-and-the-studio-in-step)): the unit's status and log, the docs the doc map names for what changed, decisions, the concept doc if it's affected. Write the [session log](#session-logs). Then write the PR description per the template, linking the log.
8. **Health check again.** `pnpm health` on the final commit, with everything pushed. Its summary goes in the PR description as proof.
9. **Merge**, unless the PR is gated: CI green, then squash-merge (see [Main is the truth](#main-is-the-truth)). If it can't be made green, the broken part comes out and the handoff lands instead.
10. **Report** to you in five lines or so: what was done, the link, the health result, what's waiting on you.

If there's budget left after an S unit, the session may take a second S unit, from a clean point.

### What `/go` picks

Top of this list first:

1. **Main is broken**: the start-of-session health check is red, CI on main is red, or a deploy failed. This isn't a choice: the health check decides it before anything else is read.
2. **Your input that hasn't been handled**: PR comments from you, answered asks that unblock something.
3. **Bugs**: `blocker` issues first, then the rest by how badly they hurt play.
4. **Open PRs** that need your call and have had it (merge or rework).
5. **The current milestone's next ready unit**, riskiest first: the unit with the biggest unknown, or a spike in front of it.
6. **Shaping** when fewer than about three units are ready: the Designer and Planner turn the next ideas into units.
7. **Balance**: after about four build units in a row, a test or tidy unit. After a milestone, a retro.
8. **Nothing obvious**: the Muse pitches, or the Tester goes bug-hunting.

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
| **1. Tools** | Node is the version the repo pins; pnpm matches `packageManager`; git. Later: Chromium is where Playwright looks (once browser tests exist) | A fresh container with the wrong Node, or a missing tool |
| **2. Dependencies** | Install from the lockfile (`--frozen-lockfile`); `node_modules` matches the lockfile; every workspace package resolves | "tsc not found" because nothing was installed, as happened when this plan was written |
| **3. Repo** | On a session branch, not `main`; no conflict markers; every top-level folder is in the [repo map](#repo-structure); how far behind `main` the branch is; at the end (`--end`), also: tree clean, everything pushed, and a PR for the branch's commits: open, or merged at this very commit (asked of GitHub with `gh api`; nothing to land passes) | Work that wasn't pushed before the container was thrown away |
| **4. Code** | `pnpm typecheck`, `pnpm test`, `pnpm build:site`; the conventions in `CLAUDE.md` that a script can test, e.g. no `Math.random()` in `packages/sim`, `packages/bob` or the stills, no DOM in the sim or Bob | Main red, or a convention quietly broken |
| **5. Studio and docs** | Every studio file follows its format, and every name in one points at a file (`studio/files`); no unit on main is `doing` or `review` (`studio/in-flight`), and at the end no unit is still `doing` (`studio/landed`); every doc and decision is in the docs index (`docs/index`); every relative link in the Markdown resolves, headings included (`docs/links`); every role has a brief and a row in the roles table (`studio/roles`), and every command a skill and a section in the producer guide (`studio/commands`); every path in the gate's list exists and the gate's own files are on it (`github/gate`); the studio page shows every unit and leaves no Markdown unconverted (`studio/page`); every label the studio uses is in `.github/labels.json`, and the bug form files with one (`github/labels`); every entry in the doc map matches a file and names docs and headings that exist (`docs/map`); on a branch, the [docs-in-step checks](#keeping-docs-and-the-studio-in-step) (`docs/in-step`, `studio/unit`, `studio/session-log`), and the workflow that enforces them runs them, again on an edit (`github/in-step`). Later, scenarios load and golden replays still give their recorded outcome | A session that changed Bob's controller and left `docs/bob.md` describing the old one |
| **6. Budgets** (later) | The sim step and render stay within their time budgets on the benchmark scene | A change that quietly costs 3 ms a frame |

- **Quick and full.** `pnpm health` runs everything; it should take a couple of minutes at most (about 80 s today, most of it the tests). `pnpm health --quick` skips the slow checks (build, replays, budgets) for use while working. Sessions start on the full run and end on `pnpm health --end`, which adds the end-of-session checks; CI runs the full run.
- **Where.** `scripts/health/`: one file per tier (`tools.ts`, `deps.ts`, `repo.ts`, `code.ts`, `studio.ts`, and `github.ts` and `instep.ts` beside it in tier 5), the helpers they share (`check.ts`), the gate workflow's logic (`gate.ts`), the runner (`run.ts`), and `health.mjs`, which says plainly when Node is too old to run the rest. Each check is a function of its context (the root, Node's version, a shell), so a test hands it a broken fixture.
- **Output.** One line per check (pass or fail, and its time), then for each failure the command that reproduces it and a hint at the usual cause. `--json` prints the same as data, for the board and the PR description.
- **Installing is a check.** `deps/install` runs `pnpm install --frozen-lockfile`: quick when nothing changed, and it fixes a fresh container, which has no `node_modules`.
- **Automatic.** A session start hook in `.claude/settings.json` runs `pnpm health --quick` (which installs), so every session (even one that isn't `/go`) sees the repo's state first thing. The hook never fails the session start: a red result is there for the session to read. The skills then require the full run before any work.
- **Nightly.** CI runs the full check on main every night, and a red run opens (or comments on) a `bug` issue, *Nightly health check failed*.

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

## Keeping docs and the studio in step

Updating the docs and the studio's files is part of the loop, not a step a session can forget. Three layers make that so: the session does it, the health check enforces it, and the Critic checks it's right.

**1. In the loop.** The *Ship* step comes before the end-of-session health check, and a session can't merge until that check is green. So docs are updated in the same PR as the change, before it merges, never "later".

**2. Enforced by the health check.** These compare the branch with main. The PR description is written last, so in a session (`pnpm health`) they only warn; the `in-step` workflow fails the PR on them, and runs again whenever the description is edited, which CI's `pnpm health` doesn't (so in CI they skip). It runs `node scripts/health/src/instep.ts <base> <head>` with the description in `PR_BODY`, which a session can run by hand too.

- **The doc map.** `studio/doc-map.json` maps code paths to the docs that describe them, for example:
  - `packages/bob/src/**` → `docs/bob.md`;
  - `packages/sim/src/materials.ts` → `docs/materials.md`;
  - `prototypes/00-stills/src/kit/**` → `docs/art-direction.md` and `concept/`;
  - `scripts/health/**` → the Health section of this doc;
  - `.claude/**` → this doc and the producer guide.

  If a PR changes a mapped path and none of its docs, the check fails (`docs/in-step`). A changed file belongs to the first entry it matches, so specific entries come first; any one of an entry's docs counts, and a `#heading` in it says where to look, not which lines must change. The way past is a line in the PR description, `Docs: none needed, because …`, with a real reason, so skipping is a decision that's written down, never an oversight. `docs/map` keeps the map honest: every path in it matches a file, and every doc and heading exists.
- **The unit** (`studio/unit`). A PR that changes anything outside `studio/` must change a unit file, its status and its log, or say `Unit: none, because …` (a dependency bump, say).
- **The session log** (`studio/session-log`). Every PR from a session adds one file to `studio/sessions/`, with valid front matter, or says `Session log: none, because …`.
- **Studio invariants.** On main, no unit is `doing` or `review` (those only exist while a session runs), every `done` unit names its PR, every open ask names what it blocks (`studio/files`, `studio/in-flight`). Planned: every closed bug issue's fix names it.
- **Indexes and the map.** Every doc is listed in `docs/README.md`; every top-level folder is in the [repo map](#repo-structure); every role in `.claude/agents/` is in [the roles table](#the-roles); every command in `.claude/skills/` is in the producer guide.
- **Generated, not written.** The board and the studio page are generated from the files and never committed, so they can't disagree with them.

**3. Checked by the Critic.** The checks prove the docs were touched, not that they're right. The Critic reads the changed docs against the diff: does the doc still say true things, and does `CLAUDE.md` still hold? When the map is missing a path, the Critic adds it to the map in the same PR.

And a sweep, because some drift is slow: the retro at the end of each milestone includes a `tidy` unit that reads each doc against the code and fixes what's gone stale.

The doc map grows like the health check: a PR that adds a package, a prototype or a format adds its entries.

### Autonomy levels

Set in `producer.md`.

| Level | Merges | You see |
|---|---|---|
| **Studio merges** (chosen) | The studio squash-merges its own PR at the end of the session, as in [Main is the truth](#main-is-the-truth), unless it's gated. | Gated PRs and playtest requests. Everything else is merged, and visible on the studio page and in the reports. |
| **Review first** | You merge every PR. Units that build on an unmerged PR are blocked, so `/go` will often find nothing ready until you've merged. | Every PR. |

**Autopilot** (`/go` run as a scheduled task within a budget) isn't planned for now. It could be added later without changing anything else.

**Gated**, at any level: changes to direction, milestones, the colour language or Bob's character, the harness's own rules, cutting an alpha or beta, and anything an ask marked gated. Gated PRs are labelled `gated` (by the gate check, so none slip through unlabelled) and wait for you: add `producer-ok` and merge, or comment. Each one is self-contained, so nothing else waits behind it.

## Builds and playtesting

### Channels

| Build | Where | When |
|---|---|---|
| **Preview** | `…/preview/pr-N/` (exists today) | Every PR. |
| **Latest** | `…/pixelbob/game/` (with the game shell) | Every merge to main. |
| **Alpha / beta** | `…/pixelbob/builds/alpha-1/`, kept forever, and a GitHub Release | When you approve a milestone build; a tag cuts it. |

- **Alpha**: the milestone's mechanics are all playable end to end; content can be rough and placeholder.
- **Beta**: the milestone's content is complete; only fixes and polish follow.
- Each comes with release notes: what's in (generated from PR titles, then edited), what to play, what's known broken (open issues), and a short playtest script. No open `blocker` issues is part of every milestone's exit criteria.

### Scenarios: putting you where the change is

A **scenario** is a small data file in `game/scenarios/`: a level, where Bob starts, his temperature and tweaks (size is one), the camera, and a **handoff card**: what changed, what to try, what to look for, known issues. `?scenario=<id>` starts the game there, and without one it starts at `start`. The format is in [Tech and toolchain](../docs/tech-and-toolchain.md#the-game), and the health check checks every scenario. Every PR that changes play links its scenario from the PR description: one click from GitHub, or the phone, into the right spot.

### Feedback: with a replay attached

The build has a feedback button (and a key, F). It opens a short form: fun, difficulty (too easy / right / too hard), frustration, and free text, prefilled with the build, the scenario and the questions from the handoff card. It will also attach a **replay** (with the replays unit; not yet): the inputs you pressed, frame by frame. The sim and Bob are deterministic, so the replay plus the build reproduces exactly what you saw, which makes "it did something weird on the second jump" a test case rather than a mystery.

The button copies the report (with the replay, compressed) to paste into a session with `/feedback`, which works on any device and needs no server or sign-in. Notes can also be typed straight into `/feedback` without the button.

Then the session **grills you** until the report is complete, a few questions at a time, each with options:

- **What happened:** what you tried and what you expected; where it happened, if there's no replay.
- **Ratings:** fun, difficulty and frustration, if you left them out.
- **Clarification:** anything vague ("felt off": too slow, too floaty, or unclear what to do?).
- **The card's questions** that weren't answered.

It stops when it has enough to act on, not when every field is full.

Then it does the rest itself:

- **Writes the report** to `studio/playtests/`: your words, the answers, the ratings, the build and scenario, the replay.
- **Raises an issue for each thing that's wrong**, labelled `bug`, with its replay and a link to the report. What you liked, what you'd change and what it taught us about your taste go into the report, the units and the taste notes, not into issues.
- **Tells you** what it understood, the issues it raised, and what will happen.

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
- **Level and puzzle editor** in the browser: paint materials and place things on the format in [Tech and toolchain](../docs/tech-and-toolchain.md#level-format), play it at once, and share it as a link or submit it as a file the studio picks up.
- **Replay viewer**: watch your runs and the bots' side by side.
- **Remix**: copy any level or scenario as the start of a new one.

## Transparency

- **GitHub**: every unit is a PR: draft from the first push, merged by the end of the session. Labels by kind, plus `gated`, `producer-ok` and `playtest` (all in `.github/labels.json`).
- **Session logs** in `studio/sessions/`: the story of every session, beside the PR that says what changed.
- **The studio page** on Pages (`…/pixelbob/studio/`), regenerated on every merge and whenever a PR or issue opens or closes: the board (milestone progress, needs you, in flight, bugs and open PRs, ready, shaped and ideas, done and dropped) and a timeline of the sessions, each with its PR. Linked from the site index above the prototypes. `studio/page.ts` turns the board's Markdown into HTML; `scripts/build-site.mjs` writes it, asking GitHub only in the deploy (`STUDIO_GITHUB=1`), so a PR preview's page has no PRs or bugs. Planned: decisions, builds (with release-builds), and your fun and difficulty ratings over time (with playtests).
- **`/status`** prints the same in a session, **`/next`** shows what `/go` would do next and why, and **`/needs-me`** goes through everything waiting on you.

## Building the studio

The order it gets built in, each a unit of its own. The first three make the harness usable; the rest come in as they're needed, so phase 3 starts as soon as possible.

1. **Health check (S), done.** `scripts/health/` with tiers 1 to 4, the session start hook, CI switched to `pnpm health`, the nightly run on main, and a test for each check. It comes first because every unit after it starts and ends with the check.
2. **Folder and board (S), done.** `studio/` with its formats, `producer.md` at "studio merges", `direction.md`, the first milestone, units for everything below, `board.ts`, a decision record ([Backlog in files](../docs/decisions/2026-10-17-backlog-in-files.md)), and the studio tier of the health check. From here the units are on the board (`pnpm board`), and this list is their outline.
3. **Roles and commands (M; on the board as three units: roles-and-commands, done; docs-in-step, done; github-gate, done).** `.claude/agents/` briefs, the `go`, `next`, `needs-me`, `director`, `feedback` and `status` skills, the doc map and its checks, labels, the bug form, the gate check, the `CLAUDE.md` pointer, and the [one-time setup](producer-guide.md#one-time-setup) for the producer. (The PR template is already in, with this plan.)
4. **Studio page (S), done.** The board on Pages, rebuilt on merges and PR events.
5. **Game shell and scenarios (M).** `game/` (the real game, distinct from the prototypes) with `?scenario=`, handoff cards, and the feedback button (copy to clipboard).
6. **Replays and the Tester's kit (M).** Input recording and playback, the headless runner, regression replays, filmstrips.
7. **Bots and forgiveness (M, spike first).** The search bot and the slack measure.
8. **Release (S).** Tag-cut alpha and beta builds under `/builds/`, GitHub Releases with notes from PR titles.
9. **Fan-out (S, later).** Parallel sessions for independent units, when the producer wants it.

Items 1 to 4 were milestone m0-studio. Items 5 to 8 are now units on the board, in milestone m1-green-alpha (phase 3, an alpha of The Green), and fan-out is an idea.

## Settled with the producer

2026-10-17, on the questions this plan first raised:

- **Merging:** the studio merges its own PRs. PR titles and descriptions are short, following the template in [PRs](#prs).
- **Feedback:** through `/feedback`. The session grills the producer to complete the report, writes it to the repo, and raises an issue itself for each thing that's wrong.
- **Backlog and issues:** the backlog is in the repo. Issues are only for things that are wrong (bugs from playtests, bots and the nightly check), never for features or planned work.
- **Autopilot:** not now; maybe later.
- **Roles:** the eleven above are the starting set.
