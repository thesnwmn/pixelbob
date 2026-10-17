# 03 Simulation

The brief: everything, Bob included, is pixels with physics, joined by forces whose strength depends on the material. Doing that literally (a spring between every pair of neighbouring pixels in the world) is too slow and too unstable for big fluid volumes. So we split the world by behaviour.

| What | Model | Why |
|---|---|---|
| Terrain, powders, liquids, gases, fire | **Cellular automaton grid** (falling-sand) | Millions of cell updates a second in JS; fluids and powders "just work"; digging and placing is a write to the grid |
| Bob, loose debris, ropes, vines, canopy | **Particles with bonds** (position-based dynamics) | Things that must keep a shape, stretch, tear and re-join |
| Big broken-off chunks (later) | Rigid bodies built from cell clusters | Falling slabs, collapsing bridges |

In both cases **material properties drive behaviour**: the "bond strength" idea survives as cohesion and viscosity on the grid, and as stiffness and break strain on the particles.

## World grid

- One cell = one world pixel. Each cell stores: `material` (u8), `temperature` (i16, tenths of a degree, or f32), `flags` (updated-this-step, sleeping, burning), a little `lifetime`/`variant`, and a cached colour variant.
- **Structure of arrays** in typed arrays (`Uint8Array` materials, `Int16Array` temperatures…) so the hot loop is cache-friendly and portable to a worker or WASM.
- **Chunks** of 64×64 with a dirty rectangle each. Only chunks that changed last step (or border a changed one) update; settled sand and still water sleep. This is what makes big levels affordable.
- **Update order**: bottom-up, alternating left/right each row and each frame to avoid directional bias. Every cell moves at most once per step.
- Movement rules per category:
  - *Powder*: down, else down-left/down-right (with a random order), else rest. An angle-of-repose/friction value per material.
  - *Liquid*: as powder, then sideways up to a dispersion distance. Density decides swaps (oil rises through water, water sinks into lava…).
  - *Gas*: as liquid but upward (or downward if heavier than air), with diffusion and decay.
  - *Fire*: short-lived, rises and flickers, heats neighbours, ignites flammables, leaves smoke/ash.
  - *Static*: doesn't move; has `integrity` so it can crumble or break off.
- **Velocity for fluids** (later): a per-cell or per-particle velocity field lets splashes and jets carry momentum. Noita's trick of throwing cells out as free particles that land back in the grid gives most of the look.

### What's built (`packages/sim`)

The first cut implements this section: `World` stores `mat`, `shade`, `temp`, `life`, `aux`, `base` and `back` as typed arrays, with 32×32 sleeping chunks. A few decisions from building it:

- **Gravity direction comes from density.** Anything denser than air (1) falls, anything lighter rises; the same move code handles sand, water, smoke and steam. Rising gases bubble up through liquids but never through powders.
- **Pressure, as levelling.** Each step every liquid cell learns the highest open surface of its connected body (passed down and sideways; stale pointers are repaired locally). A surface two or more cells lower than that pulls a cell across from the high surface, so U-bends and flooded caves even out like connected vessels. Cells with open space at their sides (falling streams) don't pass pressure on, so waterfalls don't pump pools up to their source. Only chunks holding liquid, or that changed, are visited.
- **Surge and inertia.** Liquid arriving on a rising surface carries upward momentum (scaled by how runny the liquid is), remembers which far-side surface fed it, and keeps drawing from there past level, so a filling side overshoots and the two sides rock a few times before settling (lava and mud don't surge). A surface still rising resists being drained, which is what lets it overshoot. Sideways, a liquid cell remembers which way it was flowing and keeps going, so pours run across a basin as a surge. But it only flows sideways towards somewhere lower (a drop within reach, or a lighter liquid to displace); a surface cell also looks further along the top of its own pool (up to 96 cells) for where the layer below ends, so stacked water slumps out into an even film. With nowhere lower to go it rests, so pools go still and their chunks sleep; a stacked cell with room beside it keeps its chunk awake, since the layer below may still be spreading elsewhere. Bigger, wave-like sloshing would need per-cell velocity: on the backlog.
- **Drag.** Pushing through a liquid or powder only succeeds some of the time: things sink through water at about half speed, liquids separate gradually, and a light powder under water drifts up slowly rather than swapping straight to the top.
- **Solids burn in place.** A burning log stays wood, throws short-lived fire cells into open neighbours and runs down its `life` before turning to ash. It needs air next to it to catch or keep burning, so fire eats in from exposed surfaces and buried or flooded wood smothers. Fluids that burn (oil, toxic gas) turn straight into fire.
- **Ambient temperature per cell (`base`).** Air relaxes towards it, so a cave can be a cold biome where ice lasts, without fighting the heat model. Where a cell's ambient is set away from the default, every material relaxes towards it, not just air: that is how a cold cave's rock stays cold, and how a level's lava pit stays molten instead of crusting over.
- **Plants grow on water**: a plant cell next to water drinks it and passes growth energy up to a new tip.
- **Mushrooms grow from spores**: a spore resting on dirt, wood or plants underground (rock wall behind it) sprouts a stem, far more readily near water. The stem climbs on stored energy and opens a domed, glowing cap; caps now and then drop new spores, so colonies spread. Spores that find nowhere to grow dry up.

Every material and its interactions are listed in [07 Materials](07-materials.md).

Settled worlds cost about 1.3 ms a step at 480×270; a busy one about 3 ms (Node, desktop CPU).

### Materials as data

```ts
interface MaterialDef {
  id: number; name: string;
  category: "static" | "powder" | "liquid" | "gas" | "fire" | "living";
  density: number;        // swap order for liquids, powders, gases
  viscosity: number;      // liquids: how far they spread per step
  cohesion: number;       // how much it sticks to itself / to Bob
  friction: number;
  conductivity: number;   // heat transfer per step
  heatCapacity: number;
  ignition?: number;      // °C at which it catches fire
  phases?: { below?: [number, string]; above?: [number, string] }; // water→ice at 0, →steam at 100
  reactions?: { with: string; becomes: string; other?: string; chance: number }[];
  light?: { color: string; strength: number }; // emitters
  occlusion: number;      // light blocked per cell
  colors: string[];       // ramp, picked per cell
}
```

Reactions are table driven, so designers can add "acid + metal → gas + nothing" without code.

### Temperature

Each step, a cheap diffusion between neighbours, weighted by conductivity. Air cools towards ambient. Phase changes happen at thresholds, with hysteresis so cells near 0 °C don't flicker between water and ice. Bob's particles carry temperature too and exchange heat with the cells they touch.

## Bob as particles

Built in `packages/bob`; [08 Bob](08-bob.md) describes what was built and how it differs from this plan (one rest shape per piece with a world-space squash instead of overlapping clusters; movement as rolling and crawling; cracks and slices as rules on top of strain).

Bob is about 300–500 particles at rest, one per pixel of his body. Two mechanisms hold him together:

1. **Bonds** between neighbours (distance constraints, made with XPBD so stiffness doesn't depend on the step rate). Each has a rest length, stiffness, damping and a **break strain**. Bonds form between particles closer than a radius and break when overstretched.
2. **Shape matching** (Müller et al. 2005, "meshless deformations based on shape matching") over overlapping clusters: each cluster pulls its particles towards a best-fit transform of its rest shape. That's what makes him spring back into a dome instead of draining away like water. The pull is set by a `memory` value.

Temperature maps to those parameters:

| | stiffness | break strain | memory | friction | effect |
|---|---|---|---|---|---|
| Hot | low | high (taffy) | ~0 | low | puddles, drips, flows through gaps |
| Normal | medium | medium | medium | medium | bouncy jelly |
| Cold | very high | very low | high | low on ice | rigid; shatters on a hard hit |

- **Squeezing** is free: he has no rigid collider, so particles go wherever there's space.
- **Splitting** is breaking every bond that crosses a cut line. Connected components become separate "pieces" (union-find each step or when bonds change). The piece holding the eyes is the one you control.
- **Merging**: when particles from two pieces stay within bonding radius for a few frames, new bonds form.
- **Getting caught**: snag points (spikes, hooks, sticky moss) hold particles by friction or temporary bonds; if Bob pulls away, the bonds in between stretch and eventually break.
- **Momentum**: the controller applies forces, not positions. Moving pushes his base particles; jumping is an impulse after a squash. Inertia and the bonds' lag give the stretch and wobble for free.
- **Rendering**: particles are splatted into the grid each frame as "Bob" cells for drawing and for collision with fluids, and shaded with a smoothed density field (as in the stills). Edge particles jitter visibly, which is the "made of particles" look.

## Coupling the two

- Particles **collide with solid cells**: sample occupancy at the predicted position, project out along a distance-field gradient (computed for nearby chunks only).
- Particles **displace fluid cells**: when a particle enters a liquid cell, the liquid is pushed to a free neighbour (or swapped up), so Bob splashes and wades. Buoyancy and drag come from the fluid's density and viscosity.
- **Heat and reactions**: particles exchange temperature with the cells they touch; acid cells delete Bob particles; absorbable fluids convert into Bob particles (and back).
- Order per step: grid update → particle forces → constraint solve (a few iterations) → collisions → write particles into the grid.

## Living things

Grass blades, leaves, vines and canopies are **particles on springs anchored to the grid**, moved by a global wind field (rolling gusts plus per-leaf flutter; see `kit/flora.ts`). They have no mass budget worth simulating with bonds; a simple damped spring per pixel to its rest offset is enough. When their anchor cell burns or is dug out, they drop into the grid as cells (leaves become a "litter" powder).

## Performance budget (desktop / mid-range phone)

| | Budget per frame |
|---|---|
| Grid step (about 250k cells in the active area, most of them asleep) | 3 ms / 6 ms |
| Bob (500 particles × 8 iterations) + other bodies | 1 ms / 2 ms |
| Lighting + render (GPU) | 2 ms / 5 ms |
| Total at 60 Hz | well under 16 ms |

- The grid runs on a fixed step of 60 Hz. The renderer interpolates bodies; the grid is shown as of its last step.
- **Deterministic**: seeded RNG, fixed step, no reading the clock in the sim. Makes replays, tests and bug reports possible.
- Start in plain TypeScript with typed arrays and measure. Move the grid step to a worker, then to WASM, only when profiling says so (see [04](04-tech-and-toolchain.md)).

## Open questions

- Per-cell velocity for liquids (better splashes, more cost) or free particles only?
- How far do we take rigid bodies? (They're expensive to build well; Noita uses Box2D for them.)
- Does Bob conserve particle count exactly? (That simplifies "mass is health".)
