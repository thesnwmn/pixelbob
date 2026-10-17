---
title: The gate check and GitHub setup
kind: tool
role: release
size: S
status: doing
pr: 12
milestone: m0-studio
---

## Why
Gated changes (direction, milestones, the colour language, the harness's own rules) must wait for the producer, and that shouldn't depend on an agent remembering. See [GitHub](../README.md#github).

## Done when
- A `gate` workflow labels PRs that touch gated files `gated`, and stays red until the PR also has `producer-ok`.
- The labels exist (kinds, `gated`, `producer-ok`, `playtest`, `bug`, `blocker`), and `.github/ISSUE_TEMPLATE/bug.yml` is the bug form.
- An ask to the producer with the exact steps of the [one-time setup](../producer-guide.md#one-time-setup).

## Not this
Releases (release-builds).
