---
name: next
description: Show what /go would do next in the Pixelbob studio, and the alternatives, without changing anything.
---

# /next

"What would you do next?" without doing it. You are the Director.

1. **Health**: `pnpm health --quick`. If it's red, the next thing is fixing it: say which check.
2. **Sync** as `/go` does: `pnpm board --github`, `studio/producer.md`, `studio/direction.md`, open PRs and their comments, CI on main.
3. **Pick** by the order in `.claude/skills/go/SKILL.md` (step 2), and two alternatives.
4. **Show**, and stop:

```
Next: piece HUD (build, S, engineer). Why: split action merged; playtest said you lost track of your piece.
Then: second Green level (shape, M, designer); bug #12 drop sticks to ice (fix, S).
Needs you first: nothing. Health: green.
```

Change nothing: no files, no PR, no session log.
