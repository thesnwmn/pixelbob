# Gated files: which changes wait for the producer

**Status:** accepted, 2026-10-17.

## The question
Some changes are the producer's call: direction, milestones, the colour language, Bob's character, the harness's own rules ([Autonomy levels](../../studio/README.md#autonomy-levels)). The gate check holds a PR that makes one until the producer adds `producer-ok`. It can only see paths, though. Which paths?

## What we chose
The list is [`.github/gated.json`](../../.github/gated.json): a path and a why for each entry. The `gate` workflow labels a PR that touches one `gated` and stays red until the PR also has `producer-ok`. It runs on `pull_request_target` with main's copy of the list and its logic, never the PR's, so a PR can't loosen the gate it's judged by. A rename counts by its old path too.

- **Whole files where the file is the call:** `studio/producer.md`, `studio/direction.md`, `studio/milestones/`, `.claude/`, `docs/art-direction.md` (the colour language, and Bob's look and colour) and the kit's palette, `prototypes/00-stills/src/kit/materials.ts`.
- **The health check's rules, narrowly:** the runner (`scripts/health/health.mjs`, `scripts/health/src/run.ts`), which decides which checks run and what stops a run, and CI (`.github/workflows/ci.yml`), which decides where it runs. Also the in-step check (`scripts/health/src/instep.ts` and `.github/workflows/in-step.yml`): it's what holds a PR that leaves its docs behind, so a PR mustn't be able to loosen it for itself (the producer's call, 2026-10-17, in `/needs-me`). The doc map it reads (`studio/doc-map.json`) isn't gated: most PRs that add a package or prototype add to it, and `docs/map` checks it stays true. The checks themselves aren't gated: `CLAUDE.md` asks every PR that adds something to add a check for it, so gating them would gate nearly every PR, and a new check only makes the studio stricter. A check that's weakened or deleted is the Critic's to catch, and the health section already says checks are never deleted to get green.
- **The gate itself:** the list, the workflow and the logic it runs (`scripts/health/src/gate.ts`, which imports nothing but Node, so no ungated file can change what it decides). Changing what's gated is gated, and `github/gate` in the health check fails if any of them leaves the list.

## Also considered
- **Gating `docs/bob.md` for Bob's character.** It's also the doc every change to Bob's code must update, so every Bob unit would wait for the producer. Bob's character stays a call the session and the Critic make, as the `/go` skill says: a PR that changes it is labelled `gated` by hand, and the gate holds a PR with the label just as it holds one that touches a listed file. The gate never takes the label off; a session does, if it was wrong.
- **Gating the doc map too.** Every PR that adds a package or prototype would wait for the producer.
- **Gating all of `scripts/health/`** (the plan's wording was "the health check's rules"). Too broad, for the reason above.
- **Code owners and required reviews.** The PRs are opened under the producer's account, and GitHub doesn't let anyone approve their own PR ([Don't use](../../studio/README.md#dont-use)).
- **Glob patterns.** Prefixes and exact paths cover every entry so far, and need no matcher library in the workflow.

## What it means for later
- The check only binds once the producer's ruleset requires it ([the one-time setup](../../studio/producer-guide.md#one-time-setup)). Until then it labels and reports.
- The studio uses the producer's account, so it could add `producer-ok` itself. The gate stops an accident, not a decision; sessions never add that label.
- A new kind of gated thing (say, a file of Bob's character knobs) adds its path here, in a gated PR.
