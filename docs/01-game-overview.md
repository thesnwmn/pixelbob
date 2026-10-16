# 01 Game overview

## Pillars

1. **Everything is stuff.** Every pixel on screen is a material that can be dug, poured, burnt, frozen or pushed. No painted collision boxes.
2. **Bob is stuff too.** The player is a blob of particles that deforms, flows, splits and re-forms. How he feels to move (squash, momentum, how he hugs the terrain) matters more than anything else.
3. **Materials change Bob.** The environment is your toolkit and your threat: you get Bob into the right state to solve a problem.
4. **Readable chaos.** The sim can get busy, but Bob and anything dangerous must always read at a glance.

## Bob

A coral-pink jelly about 30 world pixels wide, made of about 300–500 particles (one per pixel of his body).

| Ability | How it works in the sim | Feel |
|---|---|---|
| Move | Push particles sideways along the ground; shape memory keeps him a blob | Leans into motion, stretches with speed, trailing droplets |
| Jump | Impulse on all particles; squash before, stretch after | Big squash and stretch, wobbles when he lands |
| Squeeze | No rigid collider: particles flow through any gap a couple of pixels wide | Pours through a slot and re-forms on the other side |
| Cling | Particles stick to some materials (moss, goo); a stickiness value per material | Slow on walls and ceilings, peels off |
| Split | Player action breaks bonds along a line; pieces become separate bodies | Control the piece with the eyes; other pieces sit, or follow if set to |
| Merge | Pieces that touch re-bond over a few frames | Satisfying gloop |
| Absorb | Some fluids can be taken in (water swells him, glow goo makes him glow) | He changes colour and size |

**Mass is health and size.** Bob loses particles to acid, fire and bad splits, and gains them from water or other blobs. Too small and he can't push or cross gaps; too big and he won't fit through them.

### States (temperature and what he has absorbed)

| State | Trigger | Bonds | Behaviour | Puzzle use |
|---|---|---|---|---|
| Normal | 10–40 °C | Medium stiffness, stretchy | Bouncy jelly | Default |
| Hot / runny | > 60 °C | Weak, little shape memory, low viscosity | Spreads, drips off edges, steams, shrinks over time | Get through tiny holes; drip down to a lower level |
| Cold / brittle | < 0 °C | Very stiff, break at small stretch | Holds shape, slides on ice, shatters if hit hard | Rigid enough to be a platform or press a switch; dangerous to drop |
| Wet / swollen | Absorbed water | Softer, larger rest volume | Bigger and heavier, translucent | Weigh down plates; dilute toxins |
| Glowing | Absorbed glow goo | Unchanged | Light source that fades over time | Light dark caves; lure creatures |
| Oily | Covered in oil | Low friction with everything | Slides fast, flammable | Speed runs; danger near fire |

## Materials

| Category | Examples | Behaviour |
|---|---|---|
| Static solid | rock, stone, metal, brick, wood, ice | Doesn't move unless dug, burnt, melted or broken off |
| Powder | sand, dirt, snow, ash, salt | Falls and piles at an angle of repose |
| Liquid | water, oil, lava, molten metal, glow goo, acid | Flows and levels out; denser liquids sink, lighter ones float |
| Gas | steam, smoke, toxic gas, methane | Rises or sinks by density, diffuses, decays |
| Energy | fire, sparks, electricity | Short-lived cells that spread heat and ignite |
| Living | grass, moss, vines, leaves, mushrooms | Pixels on springs, moved by wind and contact; burn |

Interactions worth building first: water + lava → steam + rock; fire + wood → fire + smoke + ash; water at < 0 °C → ice; ice at > 0 °C → water; oil floats on water and burns; acid dissolves most things (Bob included); salt on Bob shrinks him; electricity runs through water and metal.

## Biomes

- **Meadows and hills**: grass, trees bending in the wind, ponds, floating ledges. Gentle; teaches movement.
- **Glow caverns**: dark rock lit by mushrooms, crystals and glow goo pools. Light is a resource.
- **Frozen grottos**: snow, ice and icicles; warmth (campfires, steam vents) is safety.
- **Industry**: foundries, pipes, conveyors, pistons, molten metal, steam. Hard angles and machines you rewire.

## Puzzle seeds

- Freeze Bob to make him rigid enough to wedge a door; warm him to get him back.
- Split off a chunk of Bob to hold a pressure plate while the rest goes on.
- Melt into a runny state to drip through a grate, then cool to re-form.
- Absorb water to get heavy enough for a see-saw; squeeze it out over fire to make steam.
- Carry glow goo into a dark cave; it fades, so plan the route.
- Pour sand into a pit to make a bridge. Dig a channel to drain a pool onto lava to make stone.

## Controls

| | Keyboard / pad | Touch (landscape) |
|---|---|---|
| Move | A/D, stick | Left thumb: drag anywhere on the left half |
| Jump | Space, A | Right thumb: tap |
| Squash / charge jump | Hold S, hold B | Right thumb: hold and release |
| Split | E, X | Right thumb: swipe through Bob |
| Swap piece | Q / R, bumpers | Tap a piece |

Touch rules out precision platforming: design for Bob's sloppiness to be forgiving, not punishing.
