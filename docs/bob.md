# Bob

How Bob is built, how he moves, and what every material and effect does to him. The physics is in `packages/bob` and the playground is `prototypes/02-bob` (`pnpm dev:bob`). [Simulation](simulation.md#bob-as-particles) has the original plan; this doc records what was built and why.

## What he is

Bob is a **viscoelastic fluid**: a material, not a shape. Temperature turns its knobs continuously, so he never switches from one remembered shape to another, and nothing jolts when he melts, sets, splits or picks up a bit. [Bob models](bob-models.md) says why it's this, and what else was tried. The material is `goo.ts`; `body.ts` is how his particles meet the world (collisions, water, heat, the controller).

- **About 280 particles**, one per pixel of his body (radius 9 by default), each with position, velocity and temperature.
- **Pressure and surface tension** (double density relaxation, Clavet et al. 2005).
  - Every particle pushes on neighbours within 3 px when crowded, so he keeps his volume.
  - It pulls on them when sparse, as at his surface. So drops round off, a thread is drawn into the drop at its end, and he gathers himself up.
  - Separate pieces draw together as much as `cohesion` says, without gaining speed from it.
- **Springs** between near neighbours.
  - They form whenever particles come close, at the length they are, so nothing jolts, and break when they've flowed too long.
  - Stress beyond a small yield flows into a new rest length, and any stress fades over a couple of seconds, so he never stays locked in a strained shape.
  - Normally he's a jelly that forgets dents. Runny, he flows like honey, and it's the springs that string out into threads.
- **A will to be round** (`memory`).
  - His outline is measured in 24 directions from his middle, and each particle moves in or out in proportion toward a circle of his area.
  - That circle is squashed in the world frame: **the piece he steers** is a slight dome on the ground (`sag`), squashed and stretched by jumping, while **every other bit** wants to be flatter, as far as cohesion lets it.
  - It never moves or spins him, so he rolls freely, and it's capped so an odd shape (a drop on a thread) isn't dragged about.
  - A surface well inside his outline is the edge of a hole, and it closes.
  - Hanging on a wall, he lets go of it, so he droops into a drop.
- **Frozen**, a piece is held to the shape it froze in. That's the only shape he ever remembers, and it's taken from where he already is.
- **Settling.** Normally his wobble is damped toward moving and turning as one, so he settles without his rolling being braked. Runny, viscosity drags neighbours along (`stringy`), so he drips and strings out instead of splashing.
- **Steps:** 6 substeps per 1/60 s frame. Order: forces → springs → pressure → shape → collision with the grid, then viscosity. The whole thing is deterministic, like the world.
- **Collision:** particles are points against solid cells (static or powder), resolved one axis at a time.
  - Friction comes from the material under him.
  - He can step up a single pixel. Smooth slopes (staircases of 1 px steps) roll freely, while 2 px or larger bumps snag his underside. That difference is the whole of "rough terrain".
- **Liquids:** buoyancy by density (he's 10.5 to water's 10, so he sinks slowly, about 2 px/s) and heavy drag by viscosity. He doesn't push liquid cells aside yet.
- **Keeping it calm.** Pieces pushing apart, and bits drifting together, move particles without giving them speed, and no particle may move faster than 120 px/s relative to its piece. Without these, stiff or freshly cut pieces fling bits across the screen.
- **Slopes for rigid pieces.** A pixel slope is a staircase and collisions push straight up off each step, so a frozen lump wouldn't feel the slope at all. Frozen pieces on the ground get gravity along the slope fitted through the surface under them, against friction from their weight: they creep down ice and stay put on rock.

## How he moves: everything is deformation

Bob has no feet, wheels or jetpack. **Every action is Bob changing his own shape while touching something**, and the world pushing back. That one rule decides how every effect changes his abilities: anything that stops him deforming, or takes away what he pushes against, takes the ability with it.

| Action | What he does | Needs | Lost when |
|---|---|---|---|
| **Roll** (default drive) | Turns his body like a tank tread (a torque about his centre). Friction at the bottom turns the spin into travel. | Muscle (he can deform), grip (friction underneath), ground | Frozen (can't deform). Ice: he spins in place. In the air: only a weak spin. |
| **Crawl / ooze** | His underside runs like a conveyor along whatever it touches, and friction does the pushing. Runny Bob uses this automatically because he can't hold a shape to roll with. | Muscle, grip | Same as rolling. |
| **Climb** | On resin or gum, push into it to hold on; up climbs (the part of him touching it creeps up, like a gecko's foot, the rest hanging below as a drop), down climbs down, neither holds. Up on a wall climbs rather than jumping; space still jumps. He sheds a few crumbs as he goes, on purpose: a cleaner climb loses less, so there's room for skill. | Muscle, tack | Frozen. Not pushing in: he slides off. |
| **Coast** | Momentum. Letting go, he grips gently and slows over about a second. | Nothing | Sticky ground stops him sooner, ice later. |
| **Jump** | Hold to squash (the wind-up is him holding a deformed shape), release to spring. Pushes off along the average contact normal, so slopes and walls angle the jump, leaning a little the way he's going: a full lean up to his top speed, fading smoothly past it, and landing soaks up some speed past top speed (`hop push`). A jump from a roll at up to top speed flies exactly as before; chained hops can't stack speed. | Muscle to wind up; **footing**: only what he's touching can push back, so jumps from a point (a spike tip, a corner) are weak | Frozen: can't squash, so can't jump. In the air: there's nothing to push. Forgiving timing: coyote time 0.15 s, and a jump released up to 0.15 s before landing fires on touchdown. |
| **Steer in the air** | A small sideways push (`air`). Physically a cheat, kept small. | | |
| **Swim** | Holding jump in liquid paddles upward; move steers. Let go to leap out: with no ground to squash against, the leap is uncharged and only 60% of a land jump, so water is a trap you can climb out of but not one you leave easily. | Muscle | Frozen sinks like a stone. |
| **Squash / pour** (down) | Holding down squashes him, a squat that lowers him under things: a good squash when normal, less when cold, none when frozen. Runny, it pours him down into gaps beneath him (into a pit, over an edge); only the parts with nothing under them are pushed, gently, so over an edge he lowers himself on a thread. | Pliability (temperature) | Frozen: nothing. |
| **Squeeze** | No collider, so particles go wherever there's room. But his springs and his will to be round resist big deformations, so at room temperature he won't fit through a slot much smaller than him. | Runny (heat) | Normal Bob is blocked by a 4 px slot; runny Bob flows through it. |

So **muscle** (how hard he can deform himself) and **grip** (what the surface gives back) are the two halves of every move. Temperature mostly acts on muscle and memory, and materials mostly act on grip and on what touching them does to him.

## Temperature

Each particle has its own temperature, and heat spreads through him from neighbour to neighbour. The rules are tuned for play, not physics: **get heat or cold from a visible source, then use it before it wears off.**

- **Sources shine.** Anything hotter than 150 °C (lava, fire, glowing steel) or colder than −5 °C (ice, snow) within 24 px warms or chills the particles facing it, falling off with distance (1/d, so it carries). His near side changes first and it spreads through him; he soaks it up all the way through in a few seconds, and can fine-tune by where he stands. Radiated heat alone tops out at about 92 °C, short of boiling.
- **He holds it.** Away from sources he drifts back towards the temperature around him slowly: runny lasts several seconds after leaving a brazier, and a chill lingers too. Water cools him faster than air (a dip ends a melt).
- **Touching extremes is still fast.** Lava, fire or a brazier's hot bowl boil him.
- **He gives it off.** He hands a little of his temperature to what he touches each frame: a hot Bob melts snow and ice, and a frozen Bob dropped in water freezes it around himself.
- **Tunable.** `heat soak` (how fast he takes on a source) and `heat hold` (how long he keeps it) are on the tweak panel.

So he can be half frozen, with a cold side lagging behind the warm side.

| State | Range | Muscle | Shape | Springs | What it means |
|---|---|---|---|---|---|
| Frozen | below −8 °C | none | rigid, set in the pose he froze in | don't stretch-tear, but **crack** on impact | Can't roll or jump; slides like a block (friction from his weight; long on ice, short on rock), drifts slowly down icy slopes, doesn't bounce, and cracks into chunks if dropped about 20 px |
| Cold | −8 to 8 °C | ramps 0 → full | stiffening | stiffening | Sluggish |
| Normal | 8 to 35 °C | full | jelly that settles round | springy, slowly forgetting dents | Default |
| Warm / runny | 35 to 60 °C | weakening | his will to be round fades to none: gravity and surface tension make a puddle | flow freely: **honey** (how stringy: `stringy`) | Switches from rolling to oozing (a slug's foot); a puddle about 8 px high; flows under low gaps; drips and dangles |
| Boiling | above 100 °C | weak | | | Particles boil off as steam cells: he shrinks |

**Shaking free.** Below 0 °C, struggling warms him: a trickle while you hold a direction, and a jolt for every change of direction and every tap of jump. Rattling back and forth works a frozen Bob loose in a few seconds, up to 0 °C and no further: enough to move a little at half strength, not to thaw properly (that needs a heat source or time).

**Sticky when runny.** Like honey: a runny particle touching a floor or ceiling is held against being pulled off it, with a limited grip, so a heavy enough load peels it away. It drags along the surface too. Walls only drag: he hangs from the lip above.

**Dangling.** Holding still while runny, he tenses up: stiffer, flowing much less, and his threads hold. So he can ooze to a ledge and hang there. Push on, or hold down, and he lowers himself over the edge on a thread. Too far, and the drop at the end gets too heavy and the thread snaps at its thinnest point: the drop falls and the rest stays on the ledge. Pull back quickly and the bulge comes back; leave it, and a drop goes. The course has a cliff to try it on, and a lost bit of him at the bottom of a narrow pit to pour in for.

**Setting again.** Cooling, his springs firm up and his will to be round comes back, so he rounds up from whatever shape he's in. A dip in water cools him fast.

**Thawing.** Frozen, his main piece isn't squashed in the world frame (a frozen dome rolling would otherwise be forced to change shape every frame), and he's held to the shape he froze in. Thawing, he lets go of it and rounds up.

Colours follow the stills (the stills and the game share his painter, `paintBob`): icy blue with facets and squinting eyes when frozen, orange and glowing when hot with drooping eyes.

## Coming apart and coming back

Springs break in four ways (and between pieces they form again when the pieces touch):

1. **Overstretched**: past the break strain set by `cohesion`. Judged once a frame, so a hard landing's momentary squeeze doesn't count.
2. **Blunt impact**: a particle hitting anything faster than a threshold (lower with low cohesion) splashes off as a droplet. At default cohesion only very hard hits do this.
3. **Sharp**: materials have a `sharp` value. Landing on or rolling into spikes (at a fraction of the blunt threshold) cuts a line right through him from each spike that went in, a few cuts at most per frame, leaving strips and bits. The cut stays open for 1.5 s, so bits left on the spikes stay behind until he goes back for them.
4. **Brittle**: a frozen piece hit hard cracks radially from the impact point through its middle, into chunks rather than crumbs.

All impacts are judged by how fast the **whole piece** was moving into the surface, not by single particles, which jiggle even when he sits still. So resting on spikes doesn't keep cutting him, and a frozen lump grinding over bumps doesn't crack.

Every connected group is a **piece**. One has the eyes and takes input; the rest sit where they are, slumped flat. That's the piece with most of what he was already steering, so after a split you keep the bit you had, even if a bigger one broke off. Later: a button to switch between pieces. Pieces draw together when close (surface tension, scaled by `cohesion`) and link up when they touch, a few springs a step at the length they are (so a bit joins without a jolt), unless frozen.

**Copies.** `copy(world)` gives an exact, independent Bob in a copy of the world (`World.copy()`), so the search bot can branch from a point in a run. It copies every field with the sim's `copyFields`: a new field needs nothing.

**Mass is health and score.** The playground shows what fraction of Bob is alive, how much is in the main piece, what was lost and why (boiled, dissolved, crushed, fell), and the **% of Bob that reached the finish**. That's the level goal idea from the brief: losing bits on jumps and hazards costs you, and you can go back and roll over droplets to pick them up.

## Tweaks

Every slider is in the playground's panel and saved in the URL, so a good feel can be shared as a link.

| Slider | Default | What it changes |
|---|---|---|
| cohesion | 0.6 | Surface tension, how hard he is to tear (stretch and impact), how readily bits draw together and join. 0 = sand castle, 1 = rubber |
| memory | 0.3 | His will to be round (and how slowly he forgets a dent). High = firm ball, low = sloppy |
| softness | 0.45 | How springy his springs are (wobble) |
| muscle | 1 | Strength of rolling, crawling and jumping |
| grip | 1 | Multiplies every material's friction |
| speed | 70 px/s | Top rolling speed |
| jump | 190 px/s | Take-off speed at full charge (a tap is 55%) |
| air ctrl | 0.35 | Steering in the air and in water |
| hop push | 0.25 | How much speed past top speed hops can carry: a jump's lean forward fades from top speed to (1 + hop) times it, and a landing keeps that fraction of the speed past top speed. At 0.25 the best hopping rhythm is about one and a half times as fast as rolling; at 1 about twice and more ([hop-tune](../studio/work/hop-tune.md)) |
| size | 9 | Radius in particles (respawn to apply) |
| gravity | 420 px/s² | |
| heat soak, heat hold | 1, 1 | How fast he takes on a heat source's heat or cold, and how long he keeps it |
| stringy | 0.6 | Runny, how thick he is: drips at 0, strings out like honey at 1 |

Also: `drive` (roll or crawl), a fixed temperature to try a state without walking into it, and `?at=<x>` in the link to start him partway along the course (the ice is at about 950, the spikes at 1240, the cliff at 1590).

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
| moss, resin, gum | **Tacky** (`tack` 0.35, 0.65, 1), at any temperature short of frozen. Moss (green) is grippy enough to roll up a 60° slope. Resin (amber) and gum (violet) are tacky enough to hang from: push into one to hold on (he hangs there as a drop, held at the wall, weight at the bottom), up to climb, down to climb down; stop pushing and he slides off, push away and he lets go. Gum climbs walls fast, resin slowly | Built. The course's climbing gym (left of the start) has a tower of each with a lost bit on top. Paint them with the edit tools. Later: ceilings (gum), vine |
| vine | Sticky like moss | Later |
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
| Blasts (gunpowder, methane pops) | An impulse outward that flings particles and tears springs: big blasts split him | Later: `World.explode` hands Bob an impulse |
| Electricity | Contracts all his springs at once: an involuntary hop. Wet Bob conducts. Later puzzles use him as a wire | Later (needs electricity) |
| Wind, fans | A push on exposed particles: lighter Bob is blown further | Later |
| Conveyors | Moving ground: friction carries him | Later (a tread velocity per cell, like his own crawl) |
| Bounce pads | Restitution per material | Later |
| Magnets | Pull a metal-filled Bob (absorbed rust flakes or ferrofluid) | Later |
| Crushing (pistons, falling sand) | Particles with nowhere to go are lost | Built for powders |
| Falling out of the world | Lost | Built |

### Backlog materials, through Bob's eyes

- **Slime / jelly**: a cousin. He merges with it and grows.
- **Tar and honey**: trap and slow him. Tar blackens him; honey holds him until he pulls free.
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
- **Performance:** about 2.4 ms a frame for 280 particles in Node (6 substeps). Fine on desktop; to be measured on phones before adding more bodies.

Gameplay ideas that came up while building and playing him, and aren't built, are in [Ideas](ideas.md).
