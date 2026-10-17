# Pixelbob

A pnpm TypeScript monorepo of browser prototypes for a pixel-physics platformer. Read `docs/README.md` for the design; `docs/simulation.md` is the core architecture. `docs/` is the game; `studio/` is how it gets made: the agent harness (described in `studio/README.md`, with the repo map, and being built). What's next is on the board: `pnpm board`.

## Commands

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build:site`
- `pnpm health` is the health check (tools, install, repo, typecheck, tests, site build, conventions): sessions start on it, sessions that change anything end on `pnpm health --end` (which also checks the branch has its PR), and CI runs it. `--quick` skips the build, for use while working. See `studio/README.md#health`.
- Run `pnpm health --quick` before committing.
- `pnpm board` prints the studio's board from the files in `studio/` (`--github` adds open PRs and bugs). Its formats are in `studio/README.md#the-studios-state`.
- Whatever a change adds (a tool, a dependency, a format, a convention), it adds a check for in `scripts/health/`, with a test that feeds it a broken fixture.
- `node prototypes/00-stills/scripts/render.ts <outDir> [scale] [t] [bob] [ids] [view]` renders stills to PNG without a browser (Node strips the types).

## Workflow

- Never push to `main`. Every change goes on a branch and lands through a pull request, merged with **squash merge**.
- PR titles become the squash commit message, so they follow `type(scope)!: Summary` (conventional commits, summary starting with a capital), checked by the `pr-title` workflow. Types, scopes and examples are in `studio/README.md#prs`.

## Conventions

- Prototypes are Vite apps under `prototypes/NN-name/` with `base: "./"` so they work under the GitHub Pages sub-path. `scripts/build-site.mjs` picks up any prototype that has a `dist/` after `pnpm build`.
- `packages/sim` (the world grid) must stay renderer-agnostic: no DOM, so it runs in a Web Worker and in Node tests. Material behaviour is data in `packages/sim/src/materials.ts`; the step only knows categories.
- `packages/render` is the WebGL2 renderer (`gl.ts`, the GPU port of the stills' lighting) and `shade.ts`, which turns cells into its textures; the sandbox and the Bob playground share it.
- `packages/bob` is Bob: renderer-agnostic like the sim. `goo.ts` is what he's made of (a viscoelastic fluid: pressure, surface tension, plastic springs, a will to be round); `body.ts` is how his particles meet the world (collisions, water, heat, the controller, pieces). Material effects on Bob are data too (`friction`, `sharp`, `tack`). See `docs/bob.md`, and `docs/bob-models.md` for why he's goo and not a lattice or a ring.
- Nothing about Bob should switch: temperature turns his knobs continuously, never swaps a remembered shape (every swap is a jolt).
- Deterministic: never use `Math.random()` in generation or simulation. Use `World.rand()` in the sim and the seeded helpers in `kit/rng.ts` in the stills.
- Hot loops use typed arrays (structure of arrays), not an object per cell. `noUncheckedIndexedAccess` is off for that reason.
- Only erasable TypeScript syntax (no enums, no parameter properties): `erasableSyntaxOnly` is on so Node can run `.ts` files directly.
- The look is defined by `prototypes/00-stills/src/kit/` (materials, lighting) and Bob's painter `paintBob` in `packages/bob/src/draw.ts`, which the stills and the game share. Keep the game renderer consistent with the kit, or change both. Bob in a still is always the real goo, posed by simulating him (`kit/goo.ts`), never a drawn shape.
- The worlds and their colour language are in `docs/worlds.md` and `docs/art-direction.md`: moss green grips, resin amber holds, gum violet sticks, hot colours are heat. Bob is rose pink, the one hue nothing else uses.
- `concept/` is the concept doc on Pages: a document, not a prototype, so it lives at the top level and the site index shows it above the prototypes. It draws the stills' shots live. Keep it in step with the docs.
