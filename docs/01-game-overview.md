# 01 Game overview

## Pillars

1. **Everything is stuff.** Every pixel on screen is a material that can be dug, poured, burnt, frozen or pushed. No painted collision boxes.
2. **Bob is stuff too.** The player is a blob of particles that deforms, flows, splits and re-forms. How he feels to move (squash, momentum, how he hugs the terrain) matters more than anything else.
3. **Materials change Bob.** The environment is your toolkit and your threat: you get Bob into the right state to solve a problem.
4. **Readable chaos.** The sim can get busy, but Bob and anything dangerous must always read at a glance.

## Bob

A rose-pink jelly about 20 world pixels wide, made of about 280 particles (one per pixel of his body). He's a **viscoelastic fluid**, goo, not a shape: see [08 Bob](08-bob.md) for how he works and [09 Bob models](09-bob-models.md) for why. The playground (`prototypes/02-bob`) has everything marked built below.

| Ability | How it works in the sim | Feel | Built |
|---|---|---|---|
| Roll | He turns like a tank tread; friction underneath turns spin into travel | Coasts on momentum, sits as a dome, settles when left alone | Yes |
| Jump | Hold to squash, release to spring along the ground's normal; only what he touches can push back | Big squash and stretch | Yes |
| Squash / pour | Down squats him lower (less when cold, none when frozen); runny, it pours him down into gaps | Lowers himself into a pit, over an edge | Yes |
| Squeeze | No rigid collider: runny, his particles flow under a 4 px gap that stops him at room temperature | Oozes through like a slug | Yes |
| Dangle | Runny and holding still, he tenses: he hangs off a ledge, lowers himself on a thread; too far and the thread snaps and a drop falls | Honey off a spoon | Yes |
| Climb | Tacky surfaces (moss, resin, gum): push into a wall to hold on, up and down to climb; he hangs as a drop | Gecko-ish; sheds a few crumbs (less for a clean climb) | Yes |
| Split | Spikes slice him, hard landings splash him; you keep steering the piece you had | Bits left behind to go back for | By hazards only; a split action is an [idea](10-ideas.md) |
| Merge | Pieces that touch link up, a few springs a frame at the length they are | Gentle gloop, no jolt | Yes |
| Absorb | Some fluids can be taken in (water swells him, glow goo makes him glow) | He changes colour and size | No |

**Mass is health and score.** Bob loses particles to spikes, lava, acid, drops and bad splits, and the level asks **how much of him gets to the finish**. Lost bits wait where they fell (or are hidden in the level) for him to go back for. Too small and he can't push or cross gaps; too big and he won't fit through them.

### States (temperature and what he has absorbed)

Temperature comes only from things you can see (braziers, lava, ice, snow). He soaks it up on the side facing the source first, holds it for a while, and gives it off: hot Bob melts snow and ice, frozen Bob freezes water around him.

| State | Trigger | Material | Behaviour | Puzzle use |
|---|---|---|---|---|
| Normal | 8–35 °C | Springy jelly that forgets dents, wants to be round | Rolls, jumps, settles | Default |
| Hot / runny | 35–60 °C, fully at 60 | Honey: springs flow, stringy, sticky; no will to be round | Puddles, oozes, pours, dangles and drips; boils off above 100 °C | Get through tiny gaps; pour into pits; reach down from a ledge |
| Cold / frozen | below 2 °C, solid below −8 | Stiff, holds the shape he froze in | Can't roll or jump; slides like a block, creeps down icy slopes; cracks into chunks if dropped; shaking and tapping jump works him loose a little | Rigid enough to be a platform or press a switch; dangerous to drop |
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

## Worlds

Seven worlds, each a biome with its own materials and light, each teaching one new thing: The Green (rolling, momentum, grip), Glow Caverns (runny: pour, dangle, drip), Sticky Ruins (climbing), Frozen Grotto (cold: rigid, freezing water), The Foundry (splitting on purpose, machines), The Sump (absorbing) and The Core (everything at once). See [11 Worlds](11-worlds.md).

## Puzzle seeds

The prototype course already proves a few: thaw under a brazier to jump the spikes; melt to get under a low slot; pour into a narrow pit for a lost bit that rolling over can't reach; dangle off a cliff to reach down; climb moss, resin and gum towers for bits on top. More in [10 Ideas](10-ideas.md).

- Freeze Bob to make him rigid enough to wedge a door; warm him to get him back.
- Split off a chunk of Bob to hold a pressure plate while the rest goes on.
- Melt into a runny state to drip through a grate, then cool to re-form.
- Absorb water to get heavy enough for a see-saw; squeeze it out over fire to make steam.
- Carry glow goo into a dark cave; it fades, so plan the route.
- Pour sand into a pit to make a bridge. Dig a channel to drain a pool onto lava to make stone.

## Controls

As built in the playground (split and swap are still plans):

| | Keyboard / pad | Touch (landscape) |
|---|---|---|
| Move | A/D, arrows, stick | Left thumb: drag anywhere on the left half |
| Jump (hold to charge) | Space; W / ↑ off a wall | Right thumb: tap, or hold and release |
| Down: squash, pour, climb down | S / ↓ | Left thumb: drag down |
| Up: climb a tacky wall you push into | W / ↑ | Left thumb: drag up |
| Split | E, X (planned) | Right thumb: swipe through Bob (planned) |
| Swap piece | Q / R, bumpers (planned) | Tap a piece (planned) |

Touch rules out precision platforming: design for Bob's sloppiness to be forgiving, not punishing.
