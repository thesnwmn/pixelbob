---
date: 2026-10-17
command: /go
units: [github-gate]
pr: 12
issues: []
session: https://claude.ai/code/session_01HABzYNowmf3HoDPYVdoZjk
health: green at start; green at end
size: S planned; a small share of the context, no compaction
---

## Summary
The first real `/go`. Health was green and nothing was waiting, so it took the riskiest ready unit in m0-studio, github-gate: until now nothing but the sessions' memory kept gated changes waiting for the producer. It brings the gate check, the labels as a file, the bug form, and the producer's one-time setup as an ask.

## The producer said
- `/go`, with no arguments.

## Done
- `.github/gated.json` lists the gated paths, each with why ([Gated files](../../docs/decisions/2026-10-17-gated-files.md)). The `gate` workflow (`pull_request_target`, main's copy of the list and logic, never the PR's) labels a PR that touches one `gated`, and stays red until it has `producer-ok`. A PR labelled `gated` by hand is held the same way.
- `.github/labels.json` and a `labels` workflow that syncs it to GitHub on main; `.github/ISSUE_TEMPLATE/bug.yml`, the bug form.
- Health: `github/gate` (the paths exist; the gate gates itself) and `github/labels` (every label the studio uses; the bug form's label), with tests on broken fixtures.
- The [one-time-setup](../asks/one-time-setup.md) ask, with the exact steps in [the producer guide](../producer-guide.md#one-time-setup). It blocks release-builds.

## Tried and dropped
- **Leaving the gate's decision in the workflow's shell.** The Critic pointed out the "stays red until `producer-ok`" claim had no test. It's now `verdict()` in `scripts/health/src/gate.ts`, which imports only Node, so no ungated file can change what it decides.
- **`gh pr edit --add-label`** in the workflow: some gh versions fail on it with `GITHUB_TOKEN` (it queries classic project cards). The REST labels endpoint does the same job.
- **Removing `gated` when a PR stops touching gated files.** It would also remove a label a session put on by hand for Bob's character, so the label is only ever added by the gate.

## Learned
- "The health check's rules" can't mean all of `scripts/health/`: `CLAUDE.md` asks nearly every PR to add a check, so that would gate nearly everything. The runner is gated; the checks aren't.
- The gate can't judge the PR that adds it: `pull_request_target` runs the workflow from main, where it doesn't exist yet. That's also what stops a PR from loosening its own gate. The Critic ran the gate's matcher over this PR by hand: it changes `run.ts`, which is gated, and the gate itself. So this PR is gated, labelled by hand, and waits for `producer-ok`.

## Left for next time
- The gate's first real run is the next PR. If `gate` doesn't show on it, look at the Actions tab first.
- The labels appear once this merges (the `labels` workflow runs on the push to main). Sessions don't add the kind labels yet: the `/go` skill could, in a gated PR.
- docs-in-step and studio-page are the ready units left in m0-studio.
