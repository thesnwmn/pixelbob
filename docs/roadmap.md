# Roadmap

Each phase is a prototype with a preview link, and is "done" when it answers its questions.

## Phase 0: art direction (this work)

- Repo, toolchain, CI and Pages previews.
- Procedural stills (since replaced by one shot per world, below).
- Docs: overview, art direction, simulation plan, toolchain.
- **Questions:** camera size, Bob's look and colour, how dark, how much bloom. See [Art direction](art-direction.md#still-to-settle).

## Phase 1: world sandbox (`prototypes/01-sandbox`)

A toy: start from solid rock, dig, paint materials, heat and cool, place lights. Bob is deliberately not in it: he gets his own playground in phase 2 so the two can be tuned separately.

**Status (first cut):** grid, sleeping chunks, powders, liquids, gases, fire and burning solids, temperature with phase changes, reactions (lava + water, acid, plants drinking water and growing, mushrooms sprouting from spores in damp dark places, gunpowder blasts and chains, methane flashes, mud, salt and brine, hanging vines, rust; full list in [Materials](materials.md)), a per-cell ambient temperature for cold/hot biomes, and the WebGL2 renderer with day/dusk/night/work-light looks. Brushes: dig, paint, heat, cool, lamps. Camera: zoom 1–6× (default 1.5×, the 320×180 game camera) with buttons, wheel, pinch, two-finger or middle-drag pan, and a Move tool. Not yet: save/load, chunk overlay, velocity for splashes.

1. `packages/sim`: grid, chunks with sleeping, powders, liquids, gases, fire; material table; reactions; temperature.
2. `packages/render`: WebGL2 port of the stills renderer (cells, back wall, lights, bloom).
3. Tools: dig/place brush with size, heat/cool brushes, light placement, pause/step, save/load PNG.
4. Debug HUD: frame time, sim time, active chunks, temperature under the cursor; chunk overlay.
5. Touch: pinch zoom, two-finger pan, one-finger paint.

**Proves:** the grid holds 60 fps on a mid-range phone at the target camera size, and the lighting looks like the stills in real time.

## Phase 2: Bob playground (`prototypes/02-bob`)

Bob in the sandbox.

1. Particles as a viscoelastic fluid (pressure, surface tension, plastic springs); collision with the grid; fluid displacement.
2. Controller: move, jump with squash, cling. Tune feel first, before states.
3. Temperature → spring stiffness, flow and viscosity (hot/normal/cold), splitting, merging, getting snagged.
4. Rendering: density-field shading, fizzing edges, eyes; camera follow with look-ahead.
5. A tweak panel with live sliders for every Bob parameter, saved in the URL so good settings can be shared.

**Status (first cut):** `packages/bob` and `prototypes/02-bob`. Particles as a viscoelastic fluid (pressure, surface tension, plastic springs); collision with the grid with friction per material and a one-pixel step-up; buoyancy and drag in liquids. He rolls like a tread (or crawls), coasts, charges and springs jumps along the ground's normal, and swims. Per-particle temperature drives the states (frozen can't move and cracks when dropped; runny oozes and pours through slots; boiling loses particles). Spikes slice him, hard landings splash him at low cohesion, and torn pieces draw back together. A test course runs (after an optional climbing gym to the left: moss, resin and gum towers) through flat, hills, rough ground, a water gap, ice, a brazier to thaw under, spikes, a lava jump, a narrow pit with a lost bit of Bob (pour into it while runny) beside a brazier to melt under, a low slot, a cliff to dangle from, and a cooling pool, and scores the % of Bob that reaches the finish (`?at=<x>` starts him partway along). Tweak panel with every number, saved in the URL. Shaded like the stills. The renderer moved to `packages/render` so both prototypes share it. He's goo, a viscoelastic fluid, chosen over a lattice and a ring after building all three (see [Bob models](bob-models.md)); he climbs tacky surfaces (moss, resin, gum). Not yet: pushing liquid aside, absorbing materials, a split action or switching pieces, camera polish. See [Bob](bob.md).

**Done:** the prototype answered its question; Bob is goo. Gameplay ideas that came up while playing it and aren't built yet are in [Ideas](ideas.md): a split action and switching pieces are the next things to try, then the temperature puzzles in phase 3.

**Proves:** Bob feels good to move: momentum, hugging terrain, squeezing, splitting. This is the riskiest part of the game.

## Phase 2½: concept (`concept/`)

What the whole game is, before building it: the run of worlds ([Worlds](worlds.md)), one shot per world authored at the game camera with the real goo Bob posed in each, Bob's colour settled by a study across every world (rose), a logo, mocked-up menus, HUD and settings, and a concept doc on Pages that draws the shots live.

**Status:** done. Next is the agent harness: how a team of agents builds the game from here, with a human as play tester and director.

## Phase 2¾: the studio (agent harness)

A team of agent roles that builds the game in session-sized units, with a human as producer and play tester: a Director as the one point of contact, state as files in `studio/`, a draft PR per unit, preview builds that drop the tester into a scenario with a handoff card and a feedback button that attaches a replay, and bots that play the deterministic sim. Design in [the studio](../studio/README.md), the producer's side in the [producer guide](../studio/producer-guide.md).

**Status:** done, as milestone m0-studio ([retro](../studio/sessions/2026-10-17-2031-m0-retro.md)): the health check, the studio's files and board (`pnpm board`), the roles and commands (`/go` and the rest), the docs-in-step checks, the gate and the studio page. The rest of [building the studio](../studio/README.md#building-the-studio) comes in with phase 3, as it needs it. From then on, what's next is planned in `studio/` (direction, milestones, the board); this doc keeps the history of the phases.

## Phase 3: first level slice

The Green ([Worlds](worlds.md#1-the-green)): three or four levels built from the seeds in [Game overview](game-overview.md#puzzle-seeds), checkpoints, a level file format, the title screen, map and saves from the concept doc. Audio prototype.

**Status:** current, as milestone [m1-green-alpha](../studio/milestones/m1-green-alpha.md). Its units are on the board (`pnpm board`).

## Later

Industrial machines (pistons, conveyors, switches, wiring), creatures, rigid debris, more materials, level editor polish, WASM/worker if profiling needs it, and installing as a PWA on phones.

## PR plan

1. **Init**: workspace, tsconfig, workflows, site builder, a placeholder prototype. Merge this first so Pages and PR previews start working.
2. **Stills and docs**: `prototypes/00-stills` and `docs/` (this content), reviewed through its preview link.
3. Then one PR per phase step above, and since the studio, one PR per unit ([PRs](../studio/README.md#prs)).
