# Backlog in files

**Status:** accepted, 2026-10-17.

## The question
Where does the studio keep its backlog and everything around it (units of work, questions for the producer, milestones, direction)?

## What we chose
Markdown files with a few lines of front matter in `studio/`: one file per unit (`work/`), per ask (`asks/`) and per milestone (`milestones/`), plus `producer.md` and `direction.md`. The board is generated from them by `studio/board.ts` (`pnpm board`) and never committed. The formats are in [the studio's state](../../studio/README.md#the-studios-state), and the health check's studio tier fails on a file that doesn't follow its format or names something that doesn't exist.

- **Files, not issues.** They're versioned and reviewed in the same PR as the work, so the backlog can't drift from the code. Any session reads them without an API, and anyone can see them in the repo.
- **One file each, never a shared list.** Parallel sessions on separate branches would conflict over a shared list on every merge.
- **Slugs, not numbers.** A file's name is its ID (`split-action`), so two branches can't race for the next number.
- **Front matter we parse ourselves.** A small subset of YAML (`key: value`, `[a, b]` lists, numbers, true and false), so there's no dependency and the reader can say exactly what's wrong.

## Also considered
- **GitHub issues and a Projects board.** Good for conversation, but they live outside the repo: a session needs the API to read them, they aren't reviewed with the code, and they drift from it. Issues stay for things that are wrong.
- **One `backlog.md`.** Simplest to read, but every parallel session would edit it.
- **A committed board.** It would disagree with the files the first time someone forgot to regenerate it.

## What it means for later
- The studio page on Pages is the same board, built in CI.
- A new field or status changes `studio/board.ts`, the README's format and the test fixtures together.
