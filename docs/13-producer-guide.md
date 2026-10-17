# 13 Producer guide

How you work with the studio: what you type, what comes back, and where to look. [12 The studio](12-studio.md) is how it works inside.

**Status:** planned, built by the first units in [12](12-studio.md#building-the-studio).

## Your two jobs

- **Producer.** Direction and priorities: what the game should be, what matters now, what's off the table, when a milestone is done. You make the calls marked *gated*; the studio makes the rest and tells you.
- **Play tester.** Play what you're sent, say what works, what doesn't, how hard it is and whether it's fun.

You don't need to plan, size, review code or merge (unless you want to: see [Trust](#trust)).

## Where you do it

| Place | For |
|---|---|
| **A Claude Code session** on this repo (claude.ai/code, web or app) | Commands, conversations with the Director, answering questions |
| **GitHub** | PRs to look at or comment on, merging (at first), feedback issues |
| **The studio page** (`thesnwmn.github.io/pixelbob/studio/`) | What's going on, without starting a session |
| **Builds** (preview links, `…/game/`, `…/builds/alpha-1/`) | Playing, and the feedback button |

## The commands

Four, typed into a session. Anything you type without a command goes to the Director too.

### `/go`

"I've got some budget: do the most useful next thing." The Director syncs, picks one unit, says what and why, does it, ships a PR and reports back.

```
/go                       the next thing, the Director's choice
/go small                 something that fits in half a session
/go fix the jump          steer it
/go think                 ideas or shaping, not code
/go 3                     (later) three independent units in parallel sessions
```

It ends with a short report:

```
Done: split action (build, M) → PR #41, merged.
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

After playing. Paste what the build's feedback button copied, or just write. The Director files it as a playtest report, turns problems into fix units (with your replay, if attached), updates taste notes, and replies with what it understood and what will happen. If something is ambiguous, the Designer asks.

```
/feedback split gate: splitting is great but I kept losing track of which piece was me. fun 4, difficulty right.
```

### `/status`

What's in flight, what needs you, what's next, how the milestone is going, recent builds. Same as the studio page.

## Playtesting

Every request to play comes with:

- **A link that drops you in the right place**: the build, the level, Bob's state, the camera. No playing through to get there.
- **A handoff card** on screen: what changed, what to try, what to look for, what's known broken. A few minutes, not a session.
- **A feedback button**: fun, difficulty, frustration, free text, prefilled with the card's questions. It attaches a **replay** of what you did, so anything odd you saw can be reproduced exactly. It sends as a GitHub issue, or copies for `/feedback`.

Milestone builds (alpha, beta) come with release notes and a short playtest script covering the whole milestone.

What helps most: what you *tried* and what you *expected*, not just whether it worked; where you got bored; where you got annoyed; and anything that surprised you, good or bad. Rough notes are fine.

## Questions for you (asks)

When the studio needs a call only you can make, it writes an ask: context, options, a recommendation and a **default**. Asks show on the studio page, at the start of any session and in `/status`. Answer in a session or as a comment on the PR that raised them.

Most asks expire: if you don't answer after a few sessions, the default stands and the work says so (and can be revisited). **Gated** asks (direction, milestones, Bob's character, the colour language, the studio's own rules) wait for you.

## Trust

How much the studio does without you is a setting in `studio/producer.md`, which you can change with `/director`:

1. **Ask** (the start): you merge every PR.
2. **Trusted**: it merges its own PRs when CI is green and its reviewer is happy; you see gated PRs and playtest requests.
3. **Autopilot**: as 2, and it may run `/go` on a schedule within a budget you set, with a digest each time.

## Tools you'll get

Tweak panels for every number (settings travel in the link), scenario links you can make yourself, a level and puzzle editor in the browser that plays what you paint and submits it to the studio, a replay viewer, and remixing any level as a start for a new one. The Director schedules them like any other work; ask for one with `/director`.

## A first week, for example

- **Day 1.** `/go`. The studio builds its own folder and board, and opens a PR for you to merge. Its report asks you to confirm the first milestone: an alpha of The Green.
- **Day 2.** `/director` to confirm, adding "and I want the split in it". The Designer asks two questions about splitting. Then `/go`: a spike on split controls, with a kill criterion.
- **Day 3.** You play the spike's preview on your phone for five minutes and press feedback. `/go` triages it: keep the swipe, drop the button. The spike is closed with its verdict and the build unit is shaped.
- **Day 4.** `/go` twice: the split action, then its HUD. Two preview links, one playtest card.
- **Day 5.** `/status` on the studio page from your phone. Nothing needs you; the next unit is a regression replay of your day 3 run.
