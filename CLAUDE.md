# Pixelbob

A pnpm TypeScript monorepo of browser prototypes for a pixel-physics platformer. Read `docs/README.md` for the design; `docs/03-simulation.md` is the core architecture.

## Commands

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build:site`
- Run `pnpm typecheck && pnpm test` before committing.
- `node prototypes/00-stills/scripts/render.ts <outDir> [scale] [t] [bob] [ids] [view]` renders stills to PNG without a browser (Node strips the types).

## Workflow

- Never push to `main`. Every change goes on a branch and lands through a pull request, merged with **squash merge**.
- PR titles become the squash commit message: make them descriptive.

## Conventions

- Prototypes are Vite apps under `prototypes/NN-name/` with `base: "./"` so they work under the GitHub Pages sub-path. `scripts/build-site.mjs` picks up any prototype that has a `dist/` after `pnpm build`.
- Simulation code (future `packages/sim`) must stay renderer-agnostic: no DOM, so it runs in a Web Worker and in Node tests.
- Deterministic: never use `Math.random()` in generation or simulation. Use the seeded helpers in `kit/rng.ts` (later `packages/sim`).
- Hot loops use typed arrays (structure of arrays), not an object per cell. `noUncheckedIndexedAccess` is off for that reason.
- Only erasable TypeScript syntax (no enums, no parameter properties): `erasableSyntaxOnly` is on so Node can run `.ts` files directly.
- The look is defined by `prototypes/00-stills/src/kit/` (materials, lighting, Bob). Keep the game renderer consistent with it, or change both.
