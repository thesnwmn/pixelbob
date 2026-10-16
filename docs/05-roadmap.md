# 05 Roadmap

Each phase is a prototype with a preview link, and is "done" when it answers its questions.

## Phase 0: art direction (this work)

- Repo, toolchain, CI and Pages previews.
- Procedural stills: meadow, glow cavern, foundry, frozen grotto, Bob's states, sandbox mockup.
- Docs: overview, art direction, simulation plan, toolchain.
- **Questions:** camera size, Bob's look and colour, how dark, how much bloom. See [02](02-art-direction.md#what-we-want-to-settle).

## Phase 1: world sandbox (`prototypes/01-sandbox`)

A toy: start from solid rock, dig, paint materials, heat and cool, place lights. Bob is deliberately not in it: he gets his own playground in phase 2 so the two can be tuned separately.

**Status (first cut):** grid, sleeping chunks, powders, liquids, gases, fire and burning solids, temperature with phase changes, reactions (lava + water, acid, plants drinking water and growing, mushrooms sprouting from spores in damp dark places, gunpowder blasts and chains, methane flashes, mud, salt and brine, hanging vines, rust; full list in [07](07-materials.md)), a per-cell ambient temperature for cold/hot biomes, and the WebGL2 renderer with day/dusk/night/work-light looks. Brushes: dig, paint, heat, cool, lamps. Camera: zoom 1–6× (default 1.5×, the 320×180 game camera) with buttons, wheel, pinch, two-finger or middle-drag pan, and a Move tool. Not yet: save/load, chunk overlay, velocity for splashes.

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

**Status (first cut):** `packages/bob` and `prototypes/02-bob`. Particles with XPBD bonds and shape matching; collision with the grid with friction per material and a one-pixel step-up; buoyancy and drag in liquids. He rolls like a tread (or crawls), coasts, charges and springs jumps along the ground's normal, and swims. Per-particle temperature drives the states (frozen can't move and cracks when dropped; runny oozes and pours through slots; boiling loses particles). Spikes slice him, hard landings splash him at low cohesion, and torn pieces draw back together. A test course runs through flat, hills, rough ground, a water gap, ice in cold air, a warm patch, spikes, lava, a hot slot and a cooling pool, and scores the % of Bob that reaches the finish (`?at=<x>` starts him partway along). Tweak panel with every number, saved in the URL. Shaded like the stills. The renderer moved to `packages/render` so both prototypes share it. Not yet: pushing liquid aside, absorbing materials, a split action, cling, camera polish. See [08 Bob](08-bob.md).

**Proves:** Bob feels good to move: momentum, hugging terrain, squeezing, splitting. This is the riskiest part of the game.

## Phase 3: first level slice

A meadow-to-cave level with three or four puzzles built from the seeds in [01](01-game-overview.md#puzzle-seeds), checkpoints, a level file format and a minimal title screen. Audio prototype.

## Later

Industrial machines (pistons, conveyors, switches, wiring), creatures, rigid debris, more materials, level editor polish, WASM/worker if profiling needs it, and installing as a PWA on phones.

## PR plan

1. **Init**: workspace, tsconfig, workflows, site builder, a placeholder prototype. Merge this first so Pages and PR previews start working.
2. **Stills and docs**: `prototypes/00-stills` and `docs/` (this content), reviewed through its preview link.
3. Then one PR per phase step above.
