---
title: Roles and commands
kind: tool
role: toolsmith
size: M
status: doing
pr: 0
milestone: m0-studio
---

## Why
`/go` and the other commands are how the producer drives the studio, and the roles are who does the work. Until they exist, every session reads the plan and improvises. See [The roles](../README.md#the-roles) and [Invocation](../README.md#invocation).

## Done when
- `.claude/agents/` has a brief per role in [the roles table](../README.md#the-roles), as subagent definitions with their tools limited (the Critic and the Muse can't edit).
- `.claude/skills/` has `go`, `next`, `needs-me`, `director`, `feedback` and `status`, following [Invocation](../README.md#invocation) and the [producer guide](../producer-guide.md), reading the board with `pnpm board`.
- `CLAUDE.md` points sessions at them.
- The health check fails on a role missing from the roles table or a command missing from the producer guide.

## Not this
The doc map and the PR-description checks (docs-in-step), the gate check and labels (github-gate).
