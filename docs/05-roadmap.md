# 05 Roadmap

Each phase is a prototype with a preview link, and is "done" when it answers its questions.

## Phase 0: art direction (this work)

- Repo, toolchain, CI and Pages previews.
- Procedural stills: meadow, glow cavern, foundry, frozen grotto, Bob's states, sandbox mockup.
- Docs: overview, art direction, simulation plan, toolchain.
- **Questions:** camera size, Bob's look and colour, how dark, how much bloom. See [02](02-art-direction.md#what-we-want-to-settle).

## Phase 1: material sandbox (`prototypes/01-sandbox`)

A toy: start from solid rock, dig, paint materials, heat and cool, place lights.

1. `packages/sim`: grid, chunks with sleeping, powders, liquids, gases, fire; material table; reactions; temperature.
2. `packages/render`: WebGL2 port of the stills renderer (cells, back wall, lights, bloom).
3. Tools: dig/place brush with size, heat/cool brushes, light placement, pause/step, save/load PNG.
4. Debug HUD: frame time, sim time, active chunks, temperature under the cursor; chunk overlay.
5. Touch: pinch zoom, two-finger pan, one-finger paint.

**Proves:** the grid holds 60 fps on a mid-range phone at the target camera size, and the lighting looks like the stills in real time.

## Phase 2: Bob playground (`prototypes/02-bob`)

Bob in the sandbox.

1. Particles with XPBD bonds and shape matching; collision with the grid; fluid displacement.
2. Controller: move, jump with squash, cling. Tune feel first, before states.
3. Temperature → bond parameters (hot/normal/cold), splitting, merging, getting snagged.
4. Rendering: density-field shading, fizzing edges, eyes; camera follow with look-ahead.
5. A tweak panel with live sliders for every Bob parameter, saved in the URL so good settings can be shared.

**Proves:** Bob feels good to move: momentum, hugging terrain, squeezing, splitting. This is the riskiest part of the game.

## Phase 3: first level slice

A meadow-to-cave level with three or four puzzles built from the seeds in [01](01-game-overview.md#puzzle-seeds), checkpoints, a level file format and a minimal title screen. Audio prototype.

## Later

Industrial machines (pistons, conveyors, switches, wiring), creatures, rigid debris, more materials, level editor polish, WASM/worker if profiling needs it, and installing as a PWA on phones.

## PR plan

1. **Init**: workspace, tsconfig, workflows, site builder, a placeholder prototype. Merge this first so Pages and PR previews start working.
2. **Stills and docs**: `prototypes/00-stills` and `docs/` (this content), reviewed through its preview link.
3. Then one PR per phase step above.
