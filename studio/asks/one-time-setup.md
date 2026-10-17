---
title: Will you turn on the ruleset on main?
from: release
status: open
blocks: [release-builds]
default: None. Until it's on, the CI, pr-title and gate checks are advice that sessions follow, not rules GitHub enforces.
gated: true                 # GitHub settings only the producer can change
---

The gate check, the labels and the bug form are in ([github-gate](../work/github-gate.md)). What's left is the one setting only you can change: a ruleset that makes GitHub enforce what `CLAUDE.md` asks, so nothing reaches `main` without a PR and green checks, and a gated PR can't merge without `producer-ok`. It blocks the alpha and beta builds, which are cut from `main` and should only ever be cut from a protected one.

The steps are in [the producer guide](../producer-guide.md#one-time-setup), about five minutes on github.com.

Options:
- **Turn it on** (recommended), then say so with `/director` or `/needs-me`.
- **Not yet**: the studio carries on, and asks again before the first alpha.
