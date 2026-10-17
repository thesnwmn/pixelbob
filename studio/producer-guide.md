# Producer guide

How you work with the studio: what you type, what comes back, and where to look. [The studio](README.md) is how it works inside.

**Status:** in use. Everything here works except the alpha and beta builds and the tools, which come with the game's milestones ([building the studio](README.md#building-the-studio)).

## Your two jobs

- **Producer.** Direction and priorities: what the game should be, what matters now, what's off the table, when a milestone is done. You make the calls marked *gated*; the studio makes the rest and tells you.
- **Play tester.** Play what you're sent, say what works, what doesn't, how hard it is and whether it's fun.

You don't need to plan, size, review code or merge, except PRs that need your call (see [Trust](#trust)).

## Where you do it

| Place | For |
|---|---|
| **A Claude Code session** on this repo (claude.ai/code, web or app) | Commands, conversations with the Director, answering questions |
| **GitHub** | The history: short PRs (merged by the studio), issues for bugs, releases for alpha and beta builds. Comment on any of them and the next session picks it up; file a bug with the bug form if you're not in a session |
| **The studio page** (`thesnwmn.github.io/pixelbob/studio/`) | What's going on, without starting a session |
| **Session logs** (`studio/sessions/`) | The story behind any PR: what was said, tried, dropped and learned |
| **Builds** (preview links, `…/game/`, `…/builds/alpha-1/`) | Playing, and the feedback button (copies your notes and a replay for `/feedback`) |

## The commands

Six, typed into a session. Anything you type without a command goes to the Director too.

### `/go`

"I've got some budget: do the most useful next thing." The Director syncs, picks one unit, says what and why, does it, ships a PR and reports back.

```
/go                       the next thing, the Director's choice
/go small                 something that fits in half a session
/go fix the jump          steer it
/go anyway                carry on even though the health check is red (it'll say what's broken)
/go think                 ideas or shaping, not code
```

Every session starts with the health check (tools, dependencies, code, the studio's files). If it's red, the session says so and fixes that instead of what you asked, then stops. Every session also ends with the health check, and the result is in the report and the PR.

It ends with a short report:

```
Done: split action (build, M) → PR #41, merged. Health: green at start and end.
Play: https://…/preview/pr-41/game/?scenario=split-gate (2 min)
  Try splitting on the plate and going on without the piece. Does choosing which half you keep feel natural?
Needs you: 1 ask (split direction on touch, default "across the swipe"), expires in 3 sessions.
Next up: piece HUD (S), then the second Green level (shape).
```

### `/director <anything>`

Talk to the Director: an idea, a change of direction, a worry, a question about why something is the way it is, an answer to an ask.

The Director's first job is to understand you. If it's clear, it says what it'll do with it and does it (a new unit, a change to `direction.md`, a taste note). If it isn't, it asks: a few questions at a time, each with options and a recommendation, so you can answer with a click. Then it routes it. A gameplay idea goes to the **Designer**, who may drill further ("is the point that it's hard, or that it's surprising?"); a look question goes to the **Art director**. Either may ask you more in the same session. You'll always be told who's handling it and where it ends up.

```
/director I want World 1 to feel cosier, less like a test course
/director why did we drop the ring model?
/director the colour of moss is fine, answer the ask
/director pause everything on audio until the slice is done
```

### `/feedback <notes>`

After playing. Paste what the build's feedback button copied, or just write.

The session then grills you, a few questions at a time with options to pick from, until the report is complete:

- what you tried and what you expected;
- ratings you left out;
- what a vague word like "off" meant;
- the questions on the handoff card.

Then it writes the report to the repo, raises a GitHub issue for each thing that's wrong (with the replay), turns the rest into ideas, units and taste notes, and tells you what will happen. Each issue closes when its fix merges.

```
/feedback split gate: splitting is great but I kept losing track of which piece was me. fun 4, difficulty right.
```

### `/next`

"What would you do next?" without doing it. The Director runs the same start as `/go` (health check, sync) and the same choice, then stops and shows:

```
Next: piece HUD (build, S, engineer). Why: split action merged; playtest said you lost track of your piece.
Then: second Green level (shape, M, designer); bug #12 drop sticks to ice (fix, S).
Needs you first: nothing. Health: green.
```

It changes nothing. Then `/go` takes the top pick, or `/go <one of the others>`, or `/director` to reorder. Use it to steer before spending budget.

### `/needs-me`

"Is there anything you need from me?" The Director gathers everything waiting on you, most urgent first:

1. **Blockers**: anything stopping work, such as a cloud environment setting only you can change, or a gated PR that units are waiting on.
2. **Gated PRs** waiting for `producer-ok`: what each changes and the Director's recommendation.
3. **Asks**: gated ones first, then those whose defaults expire soonest.
4. **Playtests requested**: each with its link, how long it takes, and what to look for.
5. **One-time setup** still to do.

If there's nothing, it says so in one line and suggests `/next`. Otherwise it goes through the items one at a time, each with the context and options (and a recommendation) so you can answer with a click. You can skip any of them and stop whenever you like; whatever you skip stays waiting, and an ask's default still applies when it expires. Your answers are recorded the usual way, with asks closed and settings, direction and taste notes updated, in a PR it merges before it ends. Playtests aren't done in the session: you get the links, and `/feedback` afterwards.

```
/needs-me                 everything, one at a time
/needs-me quick           just the list, answer later
```

### `/status`

What's in flight, what needs you, what's queued, how the milestone is going, recent builds. Same as the studio page. `/status` is the state of things; `/next` is the decision `/go` would make.

## Playtesting

Every request to play comes with:

- **A link that drops you in the right place**: the build, the level, Bob's state, the camera. No playing through to get there.
- **A handoff card** on screen: what changed, what to try, what to look for, what's known broken. A few minutes, not a session.
- **A feedback button**: fun, difficulty, frustration, free text, prefilled with the card's questions. It attaches a **replay** of what you did, so anything odd you saw can be reproduced exactly. It copies everything for `/feedback`.

Milestone builds (alpha, beta) come with release notes and a short playtest script covering the whole milestone.

What helps most: what you *tried* and what you *expected*, not just whether it worked; where you got bored; where you got annoyed; and anything that surprised you, good or bad. Rough notes are fine.

## Questions for you (asks)

When the studio needs a call only you can make, it writes an ask: context, options, a recommendation and a **default**. Asks show on the studio page and in `/status`, and every session's report says how many are waiting. `/needs-me` goes through them with you; you can also answer as a comment on the PR that raised them.

Most asks expire: if you don't answer after a few sessions, the default stands and the work says so (and can be revisited). **Gated** asks (direction, milestones, Bob's character, the colour language, the studio's own rules) wait for you.

## Trust

How much the studio does without you is a setting in `studio/producer.md`, which you can change with `/director`:

- **Studio merges** (chosen): every session ends with its work merged to main, so the next session has everything. Unfinished work lands switched off, and a failed attempt lands as a handoff note. It merges only when CI and the health check are green and its reviewer is happy. You see gated PRs (your calls) and playtest requests.
- **Review first**: you merge every PR. Work that builds on an unmerged PR waits for you, so `/go` will often have nothing to do until you've merged.

Running `/go` on a schedule (autopilot) isn't planned for now.

Gated PRs (direction, milestones, Bob's character, the colour language, the studio's own rules, alpha and beta builds) always wait for you. They're the only PRs left open between sessions.

## One-time setup

A few GitHub settings only you can change, asked for in [an ask](asks/one-time-setup.md) and done on 2026-10-17. The steps stay here in case they need redoing. Labels, the bug form and the gate check came in through the studio's own PRs ([github-gate](work/github-gate.md)). About five minutes on github.com:

1. **Squash merge only.** *Settings → General → Pull Requests*: tick **Allow squash merging**, untick **Allow merge commits** and **Allow rebase merging**.
2. **A ruleset on `main`.** *Settings → Rules → Rulesets → New ruleset → New branch ruleset*:
   - **Name** `main`; **Enforcement status** *Active*; **Bypass list** empty.
   - **Target branches**: *Add target → Include default branch*.
   - Tick **Restrict deletions** and **Block force pushes**.
   - Tick **Require a pull request before merging**, with **Required approvals** at 0 (the PRs are opened under your account, and GitHub won't let you approve your own), and **Allowed merge methods** *Squash*.
   - Tick **Require status checks to pass**, and add `check` (CI's `pnpm health`), `pr-title`, `gate` and `in-step`. A check only shows in the picker once it has run on a PR, so if one isn't there yet, add it after the next PR and save again.
   - **Create**.
3. Tell the studio it's done (`/needs-me` or `/director`), so it closes the ask.

To let a gated PR through, add the label `producer-ok` yourself; the studio merges it once CI is green, or you can. Only you ever add that label, even for a call you made in a session. What's gated is the list in [`.github/gated.json`](../.github/gated.json), and why each is there is in [Gated files](../docs/decisions/2026-10-17-gated-files.md).

## Tools you'll get

Tweak panels for every number (settings travel in the link), scenario links you can make yourself, a level and puzzle editor in the browser that plays what you paint and submits it to the studio, a replay viewer, and remixing any level as a start for a new one. The Director schedules them like any other work; ask for one with `/director`.

## A first week, for example

- **Day 1.** `/go`. The studio builds its health check, and merges it. Its report asks you to confirm the first milestone: an alpha of The Green.
- **Day 2.** `/director` to confirm, adding "and I want the split in it". The Designer asks two questions about splitting. Then `/go`: a spike on split controls, with a kill criterion.
- **Day 3.** You play the spike's preview on your phone for five minutes and press feedback. `/go` triages it: keep the swipe, drop the button. The spike is closed with its verdict and the build unit is shaped.
- **Day 4.** `/go` twice: the split action, then its HUD. Two preview links, one playtest card.
- **Day 5.** `/status` on the studio page from your phone. Nothing needs you; the next unit is a regression replay of your day 3 run.
