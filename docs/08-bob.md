# 08 Bob

How Bob is built, how he moves, and what every material and effect does to him. The physics is in `packages/bob` and the playground is `prototypes/02-bob` (`pnpm dev:bob`). [03 Simulation](03-simulation.md#bob-as-particles) has the original plan; this doc records what was built and why.

## What he is

- **About 280 particles**, one per pixel of his body (radius 9 by default), each with position, velocity and temperature.
- **Bonds** join each particle to its 8 neighbours. They are XPBD distance constraints that can break, and they re-form when particles touch.
- **Shape matching** (`memory`) pulls every connected piece towards its rest shape, rotated to fit. This is what keeps him a blob instead of a puddle.
  - The rest shape is a disc.
  - The target is squashed in world space, so the squash doesn't roll round with him. **The piece he controls remembers being round**: a slight dome on the ground (`sag`), squashed and stretched by jumping. **Every other bit slumps flat**, as far as cohesion lets it (a thin film at low cohesion, a thick lump at high; runny bits spread further). A flat bit that becomes the main piece rounds back up.
  - When a piece tears off or rejoins, it keeps the memory of the piece most of it came from, and newcomers take their place in it. Its round target is its current outline inflated evenly into a circle of the right size, then settled onto an even grid, so neighbours stay neighbours and nothing is packed tighter than particles can sit; it relaxes there in about a second.
  - Bonds settle to the spacing of his rest shape, so they agree with the shape memory (bonds between particles that aren't neighbours in it go slack). Before this, bits merging back on while squashed made bonds that held him flat, and a flat lump can't roll.
- **Steps:** 10 substeps per 1/60 s frame, one constraint pass each.
  - Order: forces → shape matching → bonds → particle spacing → collision with the grid.
  - The whole thing is deterministic, like the world.
- **Collision:** particles are points against solid cells (static or powder), resolved one axis at a time.
  - Friction comes from the material under him.
  - He can step up a single pixel. Smooth slopes (staircases of 1 px steps) roll freely, while 2 px or larger bumps snag his underside. That difference is the whole of "rough terrain".
- **Liquids:** buoyancy by density (he's 10.5 to water's 10, so he sinks slowly, about 2 px/s) and heavy drag by viscosity. He doesn't push liquid cells aside yet.
- **Keeping it calm.** Shape matching only ever reshapes a piece, never moves or spins it: half-frozen, his particles pull with different strengths, and uneven pulls used to push him along by themselves (enough to launch him off a slope). Pieces pushing apart, and bits drifting together, move particles without giving them speed, and no particle may move faster than 120 px/s relative to its piece. Without these, stiff or freshly cut pieces fling bits across the screen.
- **Slopes for rigid pieces.** A pixel slope is a staircase and collisions push straight up off each step, so a frozen lump wouldn't feel the slope at all. Frozen pieces on the ground get gravity along the slope fitted through the surface under them, against friction from their weight: they creep down ice and stay put on rock.

## How he moves: everything is deformation

Bob has no feet, wheels or jetpack. **Every action is Bob changing his own shape while touching something**, and the world pushing back. That one rule decides how every effect changes his abilities: anything that stops him deforming, or takes away what he pushes against, takes the ability with it.

| Action | What he does | Needs | Lost when |
|---|---|---|---|
| **Roll** (default drive) | Turns his body like a tank tread (a torque about his centre). Friction at the bottom turns the spin into travel. | Muscle (he can deform), grip (friction underneath), ground | Frozen (can't deform). Ice: he spins in place. In the air: only a weak spin. |
| **Crawl / ooze** | His underside runs like a conveyor along whatever it touches, and friction does the pushing. Runny Bob uses this automatically because he can't hold a shape to roll with. | Muscle, grip | Same as rolling. Also, walls aren't climbed (yet). |
| **Coast** | Momentum. Letting go, he grips gently and slows over about a second. | Nothing | Sticky ground stops him sooner, ice later. |
| **Jump** | Hold to squash (the wind-up is him holding a deformed shape), release to spring. Pushes off along the average contact normal, so slopes and walls angle the jump. | Muscle to wind up; **footing**: only what he's touching can push back, so jumps from a point (a spike tip, a corner) are weak | Frozen: can't squash, so can't jump. In the air: there's nothing to push. Forgiving timing: coyote time 0.15 s, and a jump released up to 0.15 s before landing fires on touchdown. |
| **Steer in the air** | A small sideways push (`air`). Physically a cheat, kept small. | | |
| **Swim** | Holding jump in liquid paddles upward; move steers. Let go to leap out: with no ground to squash against, the leap is uncharged and only 60% of a land jump, so water is a trap you can climb out of but not one you leave easily. | Muscle | Frozen sinks like a stone. |
| **Squeeze** | No collider, so particles go wherever there's room. But bonds and shape memory resist big deformations, so at room temperature he won't fit through a slot much smaller than him. | Low memory (heat) | Normal Bob is blocked by a 4 px slot; runny Bob pours through it in about 2 s. |

So **muscle** (how hard he can deform himself) and **grip** (what the surface gives back) are the two halves of every move. Temperature mostly acts on muscle and memory, and materials mostly act on grip and on what touching them does to him.

## Temperature

Each particle has its own temperature. It exchanges heat with the cell it's in and the cell it touches (faster with conductive materials such as steel, lava and water), and heat spreads through him along his bonds. So he can be half frozen, with a cold side lagging behind the warm side.

| State | Range | Muscle | Shape | Bonds | What it means |
|---|---|---|---|---|---|
| Frozen | below −8 °C | none | rigid, set in the pose he froze in | don't stretch-tear, but **crack** on impact | Can't roll or jump; slides like a block (friction from his weight; long on ice, short on rock), drifts slowly down icy slopes, doesn't bounce, and cracks into chunks if dropped about 20 px |
| Cold | −8 to 8 °C | ramps 0 → full | stiffening | stiffening | Sluggish |
| Normal | 8 to 40 °C | full | bouncy jelly | stretchy | Default |
| Warm / runny | 40 to 70 °C | weakening | memory fades to almost none | **taffy**: bonds take on whatever length they're pulled to | Switches from rolling to oozing; spreads into a puddle; pours through gaps; stays poured until cool |
| Boiling | above 100 °C | weak | | | Particles boil off as steam cells: he shrinks |

**Shivering.** Below room temperature, trying to move or jump warms him a little (0.15 °C a frame). In mild cold (the course's −15 °C air) that keeps a moving Bob cold and sluggish but able to crawl out; if he stops, he freezes. Without it, a Bob frozen in a cold zone could never move or thaw.

**Thawing.** Frozen, his main piece's target stops being squashed in world space (a frozen dome rolling would otherwise be forced to change shape every frame and shake itself apart). On thawing he takes his current shape as a fresh start, and both his rest shape and his bonds' lengths relax back to a round blob over a second or two.

Colours follow the stills: icy blue with facets and squinting eyes when frozen, orange and glowing when hot with drooping eyes.

## Coming apart and coming back

Bonds break in four ways:

1. **Overstretched**: past the break strain set by `cohesion`. Judged once a frame, so a hard landing's momentary squeeze doesn't count.
2. **Blunt impact**: a particle hitting anything faster than a threshold (lower with low cohesion) splashes off as a droplet. At default cohesion only very hard hits do this.
3. **Sharp**: materials have a `sharp` value. Landing on or rolling into spikes (at a fraction of the blunt threshold) cuts a line right through him from each spike that went in, a few cuts at most per frame, leaving strips and bits. The cut stays open for 1.5 s, so bits left on the spikes stay behind until he goes back for them.
4. **Brittle**: a frozen piece hit hard cracks radially from the impact point through its middle, into chunks rather than crumbs.

All impacts are judged by how fast the **whole piece** was moving into the surface, not by single particles, which jiggle even when he sits still. So resting on spikes doesn't keep cutting him, and a frozen lump grinding over bumps doesn't crack.

Every connected group is a **piece**. The biggest has the eyes and takes input; the rest sit where they are, slumped flat. Pieces draw together when close (surface tension, scaled by `cohesion`) and re-bond when they touch, unless frozen.

**Mass is health and score.** The playground shows what fraction of Bob is alive, how much is in the main piece, what was lost and why (boiled, dissolved, crushed, fell), and the **% of Bob that reached the finish**. That's the level goal idea from the brief: losing bits on jumps and hazards costs you, and you can go back and roll over droplets to pick them up.

## Tweaks

Every slider is in the playground's panel and saved in the URL, so a good feel can be shared as a link.

| Slider | Default | What it changes |
|---|---|---|
| cohesion | 0.6 | Break strain, impact threshold, rejoin chance and pull. 0 = sand castle, 1 = rubber |
| memory | 0.3 | Pull back to his shape. High = firm ball, low = sloppy |
| softness | 0.45 | Bond compliance (wobble) |
| muscle | 1 | Strength of rolling, crawling and jumping |
| grip | 1 | Multiplies every material's friction |
| speed | 70 px/s | Top rolling speed |
| jump | 190 px/s | Take-off speed at full charge (a tap is 55%) |
| air ctrl | 0.35 | Steering in the air and in water |
| size | 9 | Radius in particles (respawn to apply) |
| gravity | 420 px/s² | |

Also: `drive` (roll or crawl), a fixed temperature to try a state without walking into it, and `?at=<x>` in the link to start him partway along the course (the ice is at about 460, the spikes at 600).

## Materials and effects on Bob

The whole range, built or not. **Built** means it works in the playground today. Material numbers are `friction` and `sharp` in `packages/sim/src/materials.ts`, next to everything else about the material.

### Ground he stands on

| Material | Contact | Status |
|---|---|---|
| rock, stone, dirt | Ordinary grip (0.45–0.5) | Built |
| grass (plant) | Slightly grippier | Built. Later: cushions landings |
| wood | Ordinary grip | Built. Later: splinters (low sharp) when broken |
| steel | Slippery-ish (0.3); conducts heat, so hot or cold plates change his temperature quickly | Built |
| ice | Almost no grip (0.02), so he can't get going, can't stop, and turns slopes into slides; cold to touch | Built |
| snow | Low grip, cold | Built. Later: soft landing, he sinks in a little |
| sand, salt, rubble | Powders: solid to him, grippy (rubble a bit sharp). Powder falling on him pushes particles aside; buried too deep and they're crushed | Built. Later: sand sticks to him and weighs him down |
| glass | Slippery, and slightly sharp | Built (data) |
| spikes | Sharp: slice him into strips and bits | Built (new material). Later: a hard **edge** (a blade of steel or glass) that splits him cleanly in two, maybe into two halves you control in turn: good as well as bad |
| rust | Grippy; crumbles under him | Built (rust's own crumbling) |
| vine, moss | Sticky: he can cling and climb slowly | Later: needs per-material stickiness pulling particles onto the surface (the "cling" ability) |
| mushroom cap | Springy: a bounce pad | Later: restitution per material |

### Things he's in

| Material | Effect | Status |
|---|---|---|
| air | Warms or cools him towards its temperature, so cold caves freeze him and hot rooms melt him | Built |
| water | Buoyant (he sinks slowly), heavy drag, swim, a weak leap out; cools him towards its temperature | Built. Later: **absorbs** water and swells (wet state: bigger, heavier, softer) and drips it out when squeezed |
| brine | Denser, so he floats higher | Built (buoyancy). Later: salted Bob's freezing point drops, so he stays soft in the cold |
| oil | Floats on him; drag | Built (buoyancy/drag). Later: **coats** him, giving the oily state (low friction everywhere, flammable) |
| mud | Very thick: heavy drag | Built. Later: sticky, coats and slows him after he leaves |
| lava | He floats on it and boils off in moments | Built |
| acid | Dissolves his particles (and is used up doing it) | Built |
| glow goo | | Later: absorbs it and **glows** (a moving light source that fades) |
| steam | Hot: warms him | Built (temperature). Later: vents push him up |
| fire | Very hot: boils him | Built (temperature). Later: an oily Bob catches fire |
| smoke | Nothing | |
| toxic gas | | Later: slowly shrinks him and tints him green |
| methane | Its flash is heat | Built (temperature) |
| spores | | Later: spores landing on a damp Bob sprout tiny mushrooms on him, which slow him until he dries out |
| ash | Powder | Built. Later: dries him out |

### Effects and forces

| Effect | On Bob | Status |
|---|---|---|
| Heat and cold brushes | Change his temperature through the cells | Built |
| Blasts (gunpowder, methane pops) | An impulse outward that flings particles and tears bonds: big blasts split him | Later: `World.explode` hands Bob an impulse |
| Electricity | Contracts all his bonds at once: an involuntary hop. Wet Bob conducts. Later puzzles use him as a wire | Later (needs electricity) |
| Wind, fans | A push on exposed particles: lighter Bob is blown further | Later |
| Conveyors | Moving ground: friction carries him | Later (a tread velocity per cell, like his own crawl) |
| Bounce pads | Restitution per material | Later |
| Magnets | Pull a metal-filled Bob (absorbed rust flakes or ferrofluid) | Later |
| Crushing (pistons, falling sand) | Particles with nowhere to go are lost | Built for powders |
| Falling out of the world | Lost | Built |

### Backlog materials, through Bob's eyes

- **Slime / jelly**: a cousin. He merges with it and grows.
- **Tar and honey**: trap and slow him. Tar blackens him; honey holds him until he pulls free and bonds stretch.
- **Quicksand**: sucks him down unless he keeps moving.
- **Concrete**: setting around him pins the particles inside.
- **Molten metal**: like lava, but it sets into new floors he can roll on.
- **Clay**: soft and grippy; fired, it becomes brick.
- **Cloud / rain**: wets and cools him; a rain zone keeps a hot Bob from melting.
- **Void**: deletes particles; a pit hazard.
- **Coal and thermite**: heat sources to melt him on purpose.

## Open questions

- **Roll or crawl?** Rolling has more momentum and reads as "blob". Crawling is more controllable and doesn't need him round. Both are in the playground to compare. Runny Bob already crawls whatever is chosen.
- **Should he steer in the air?** Physically he can't. A small amount helps on touch screens.
- **Should loose droplets count?** Today only particles in the finish box count, whichever piece they're in.
- **Slot sizes.** Normal Bob only squeezes through gaps a bit smaller than him, so "too big to fit" puzzles work. Is that the right line?
- **Performance:** about 1.5 ms a frame for 280 particles in Node (10 substeps). Fine on desktop; to be measured on phones before adding more bodies.
