# Bob models

Bob is goo: a viscoelastic fluid ([Bob](bob.md#what-he-is) says how he works). This doc records how that was decided, because two other ways of modelling him were built, played and compared first. All three were in the playground side by side, behind the same behaviour tests, and goo won clearly; the other two were then removed (they're in the git history: the lattice is `packages/bob/src/blob.ts` and the skin `skin.ts`, before "Goo is Bob").

## Why not the first one

The first model, the **lattice**, was a solid with a remembered rest shape: particles on a grid, bonds between neighbours, and shape matching pulling them back to the rest shape. That's a great jelly. But most of what we ask of him is liquid behaviour: puddling, pouring into a pit, dangling, dripping, picking up bits, setting again after melting. Each one fights the remembered shape.

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

Tuning the constants moved these problems around without removing them. The fix was a model where none of those swaps exist.

## What was compared

| | Lattice | **Goo** (kept) | Skin |
|---|---|---|---|
| What he is | A grid of particles with bonds and a rest shape | A fluid of particles: pressure, surface tension, springs that flow | A ring of points (his skin) around a pressure, as in *Gish* or *LocoRoco* |
| What keeps him round | Shape matching to the remembered disc | Surface tension, plus a will to be round that steers his outline | Pressure plus skin tension: a balloon |
| Temperature | Swaps rest shapes at thresholds | Turns the knobs continuously | Turns skin tension and stiffness |
| Picking up a bit | Jolts, then lumpy | Smooth | The two rings are spliced into one |
| Dangling | A beam, then a drop | Hangs and reaches down; too far and the thread snaps | Can't: a ring rolls off a ledge like a tread |
| Spikes | Cut; bits stay | Cut; bits stay and rejoin later | Cut in two; the halves bounce and roll away |
| Climbing tacky surfaces | No | Yes | No |
| Cost per step | ~2 ms | ~2.4 ms | ~0.5 ms |

What the shared tests said:

| Model | Couldn't do |
|---|---|
| Lattice | Dangle and drip; pick up the pit's bit without a jolt; climb; keep steering the piece you had after a split |
| Goo | none |
| Skin | Dangle and drip; settle its bits after spikes; climb. On the course, runny skin also struggled with the pit and the slot: it's a balloon, not a liquid |

Skin was the roundest and bounciest, and by far the cheapest; liquid behaviour was its weak spot. Goo was the only one that did everything, and in play it "won by a mile".

## Lessons worth keeping

- **Nothing about him should switch.** Temperature should turn knobs, never swap a remembered shape: every swap is a jolt the player sees.
- **Liquids need a yield and a will.** A pure liquid never stops flowing, so he couldn't hang on anything. Tensing up when the player holds still (stiffer, flowing less) is what made dangling work.
- **Shape terms must be momentum-neutral and capped.** A pull towards a shape that moves or spins him, or that can move a particle fast, pumps energy in: he flies off slopes, or shakes apart.
- **Particle fluids need enough neighbours.** With a 2 px kernel the fluid clumped into chains and hollow shells; 3 px (about 28 neighbours) fixed it.
- **Viscosity goes on velocities after the solve**, as in position-based fluids. Before the solve, the constraints rebuild the flow and it does nothing.
- **Damp wobble towards rigid motion, not towards neighbours.** Neighbour smoothing brakes rolling; damping towards moving and turning as one doesn't.
- **A ring model's skin must never be slack**, and every cut and splice must leave rings the right way out, or the pressure blows the tangle up.
