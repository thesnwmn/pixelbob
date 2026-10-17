# 09 Bob models

There are three ways of modelling Bob in `packages/bob`, switchable in the playground (the picker in the bar, or `?model=lattice|goo|skin`). They share everything except what holds his particles together. This doc says why there are three, how each works, and how they compare. [08 Bob](08-bob.md) covers what he can do and what materials do to him, which is the same for all of them.

## Why not just keep tuning the first one

The first model (now **Lattice**) is a solid with a remembered rest shape: particles on a grid, bonds between neighbours, and shape matching pulling them back to the rest shape. That's a great jelly. But most of what we ask of him is liquid behaviour: puddling, pouring into a pit, dangling, dripping, picking up bits, setting again after melting. Each one fights the remembered shape.

So the lattice grew special cases, and each one swaps his remembered shape for a new one in a single step:

- `reshape` when a bit joins or tears off;
- `reform` when he sets after melting;
- the `melted` and `rigid` flags;
- taffy bonds;
- honey anchors.

Each swap is a jolt. That's where the playtest problems came from:

| What you saw | Why (lattice) |
|---|---|
| Picking up the pit's bit, he bursts out sideways | The bit joins with a remembered place far from where it is; shape matching yanks it there (247 px/s in the test) |
| Afterwards he's never quite right: a lump on one side, even runny | The merged shape is remembered, lump and all |
| Dangling over the cliff is odd | He's a solid pretending to flow: anchors hold a beam out over the edge, then let go all at once |

Tuning the constants moves these problems around without removing them. The fix is a model where none of those swaps exist.

## The three models

| | **Lattice** (v1) | **Goo** (v2, default) | **Skin** (v3) |
|---|---|---|---|
| What he is | A grid of particles with bonds and a rest shape | A fluid of particles: pressure, surface tension, and springs that flow | A ring of points (his skin) around a pressure, as in *Gish* or *LocoRoco* |
| What keeps him round | Shape matching to the remembered disc | Surface tension, plus a will to be round that steers his outline | Pressure plus skin tension: a balloon |
| Temperature | Swaps rest shapes at thresholds | Turns the knobs continuously: stiffness, how fast springs flow, viscosity | Turns skin tension and stiffness |
| Picking up a bit | Jolts, then lumpy | Smooth: links form at the length they are | The two rings are spliced into one |
| Runny | Taffy bonds and honey anchors | A thick liquid: it drips, hangs on a thread and pinches off | A slack balloon; necks pinch explicitly |
| Dangling | A beam, then a drop | Hangs and reaches down; too far and the thread snaps | Can't: a ring rolls off a ledge like a tread |
| Spikes | Cut along a line; bits stay | Cut along a line; bits stay and rejoin later | Rings are cut in two; the halves are bouncy balls and roll away |
| Cost per step | ~2 ms | ~2.4 ms | ~0.5 ms |

### Goo (the recommendation)

If I were starting again, this is what I'd build. Bob is a *material*, not a shape. **Temperature never switches anything: it turns knobs continuously.** So there's no moment where he jumps from one remembered shape to another.

- **Particles**, one per pixel, as before.
- **Pressure and surface tension (double density relaxation, Clavet et al. 2005).**
  - Each particle pushes on neighbours within 3 px when crowded, so he keeps his volume.
  - It pulls on them when sparse, as at his surface, so drops round off, a thread is drawn into the drop at its end, and he gathers himself up.
  - The rest density is worked out so a grid one pixel apart is at rest.
  - Separate pieces attract each other as much as `cohesion` says, without gaining speed from it.
- **Springs** between neighbours.
  - They form whenever particles come close (at the length they are, so nothing jolts) and break when they've flowed too long.
  - Stress beyond a small yield flows into a new rest length, and any stress at all fades over a couple of seconds, so he never stays locked in a strained shape.
  - Normally that's a jelly that forgets dents. Runny, it flows like honey, and it's the springs that string out into threads.
- **A will to be round.**
  - His outline is measured in 24 directions from his middle.
  - Each particle is moved in or out in proportion, toward a circle of his area. For the jump and squash, that circle is an ellipse in the world frame.
  - It never moves or spins him, so he rolls freely, and it's capped so an odd shape (a drop on a thread) isn't dragged about.
  - A surface well inside his outline is the edge of a hole, and it closes.
  - Bits he isn't steering want a flatter ellipse.
- **Frozen** pieces are held to the shape they froze in. That's the only remembered shape, and it's taken from where he already is, so nothing jumps.
- **Viscosity** (XSPH on velocities) only when runny. Normally, wobble is damped toward his rigid motion, so he settles without his rolling being braked.
- **Runny and holding still, he tenses**: stiffer, flowing less, and his threads hold. That's what lets him hang off a ledge without draining over it.
  - Pushing on oozes him further.
  - Down lowers him on a thread.
  - Too far, and the thread snaps at its thinnest point.
- **Oozing** is a slug's foot: his underside creeps a little ahead of him and he leans that way. It's not a conveyor, which would run his underside out as a tongue.

`stringy` (0 to 1) sets how thick runny Goo is: drips at 0, honey at 1. `memory` is his will to be round, `softness` his springiness, and `cohesion` his surface tension and how readily bits join.

### Skin

The classic soft-body blob, as a comparison point.

- His skin is a ring of points, about 1 px apart. Points are added and removed as it stretches.
- A pressure keeps the ring's area, which is his mass.
- Skin tension pulls toward the perimeter of a circle of that area. It's weaker when runny but never slack, because slack skin wrinkles and crosses itself.
- Skin repels skin (points and edges) so it never crosses.
- Liquid things are explicit operations on the ring:
  - A spike or a crack cuts the ring along a line.
  - Touching rings are spliced into one, by chance per step, scaled by cohesion.
  - A runny ring pinches in two where a neck's sides meet from inside while the halves pull apart.
- What you see and what counts toward "% of Bob" is the filled inside, one point per pixel.

It's the most robustly round and bouncy, and by far the cheapest. Liquid behaviour is its weak spot: it rolls off ledges, and its bits bounce.

### Lattice

Kept as it was: the same code, bit for bit, as a reference. See [08 Bob](08-bob.md#what-he-is).

## What the tests say

`packages/bob/test/blob.test.ts` runs the same behaviour tests against every model. That covers rolling, jumping, ice, water, heat, freezing, cracking, the slot, the pit, spikes, rejoining, settling, the full course, and two tests from the playtest notes: dangling, and a gentle pickup. A test a model can't pass is marked as an expected failure, as a record:

| Model | Can't do |
|---|---|
| Lattice | Dangle and drip; pick up the pit's bit without a jolt |
| Goo | none |
| Skin | Dangle and drip (rolls off the ledge); bits settle quickly after spikes (they bounce) |

`BOB_MODELS=skin pnpm test` runs one model (or a comma-separated list).

## What to try

In the playground, pick a model in the bar (it's kept in the link). The sliders that don't apply to a model are dimmed.

- **The pit (Goo vs Lattice):** melt under the brazier, come back and hold down over the pit. Watch the bit join, then let him cool.
- **The cliff (Goo):**
  - Ooze to the edge and let go: he hangs.
  - Push on a little: he reaches down.
  - Hold down: he lowers himself on a thread.
  - Too far: the thread snaps.
  - Pull back quickly: the bulge comes back. Leave it, and a drop goes.
- **Rolling and jumping (Skin vs Goo):** Skin is the bounciest and roundest; Goo is softer and settles.
- **Spikes and ice (all three).**
- **`stringy`, `cohesion` and `memory` (Goo):** these change how runny Goo drips and how readily his bits rejoin.

If Goo is the one, the next step is to delete the lattice (and probably Skin), make Goo the only Bob, and move the remaining tuning into the course.
