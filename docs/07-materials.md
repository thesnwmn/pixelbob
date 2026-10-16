# 07 Materials

The material catalogue: what exists in `packages/sim` today, how each one behaves and what it reacts with, and a backlog of ideas. Behaviour numbers (density, flammability, conductivity…) live in `packages/sim/src/materials.ts`; reactions live in `packages/sim/src/world.ts`.

How to read the categories:
- **static**: stays put unless dug, burnt, melted or blown up.
- **powder**: falls and piles.
- **liquid**: falls, then flows sideways.
- **gas**: rises if lighter than air (density 1), sinks if heavier.
- **fire**: short-lived and rises.

Anything denser falls through anything lighter, with drag through liquids and powders.

## Built

| Material | Category | Behaviour and interactions |
|---|---|---|
| rock | static | Diggable. Melts to lava above ~1100 °C. Blasts break it (it's tougher than dirt) into rubble. |
| dirt | static | Water soaks it into mud. Melts above ~1100 °C. Acid eats it. Spores sprout on it. |
| stone | static | Made when lava cools; behaves like rock. |
| sand | powder | Piles. Turns to glass above ~900 °C. |
| glass | static | Made from sand; lets most light through. |
| water | liquid | Freezes below 0 °C, boils above 100 °C. Puts out fire. Soaks dirt into mud. Plants and vines drink it. Rusts steel. Dissolves salt into brine. |
| ice | static | Melts above ~2 °C; insulates, so it melts slowly. Salt melts it. |
| snow | powder | Melts above ~1 °C; light, so it drifts up through water slowly. |
| oil | liquid | Floats on water. Burns readily. |
| lava | liquid | 1200 °C and viscous. Water on it makes stone and steam. Ignites things and melts ice. Cools to stone. |
| steam | gas | Rises, and condenses back to water as it fades. |
| smoke | gas | Rises and fades. |
| fire | fire | Climbs, flickers, heats, and spreads to flammables. Water puts it out (into steam and smoke). |
| wood | static | Burns in place (throwing flames) and leaves ash. |
| plant | static | Drinks adjacent water and grows upward. Burns. |
| vine | static | Hangs: grows down, or creeps along a ceiling. Drinks water for more growth. Burns. |
| spores | powder | Faint glow; drift down. Sprout into mushrooms underground on dirt, wood, plants or ash, much faster near water. Dry up if they never find a spot. |
| stem / cap | static | The mushroom: the stem climbs, then opens a glowing cap. Caps shed spores, so colonies spread. Both burn. |
| ash | powder | Left by fire. Slightly denser than water, so it settles as sludge. |
| steel | static | Conducts heat well. Rusts when wet (faster in brine). Blasts don't break it. |
| rust | static | Brittle. Flakes away when nothing solid is under it. |
| rust flakes | powder | What rust crumbles into. |
| salt | powder | Dissolves into water as brine. Melts ice and snow. |
| brine | liquid | Denser than water, so it sinks under it. Freezes only below −15 °C. Boiling it leaves salt behind. Rusts steel faster. |
| mud | liquid | Thick and slow. Dries back to dirt above 60 °C. Burps methane bubbles. |
| methane | gas | Light and invisible-ish (faint violet). Ignites in a fast flash front, with the odd small pop. |
| gunpowder | powder | Once lit, it fizzes for a few steps then explodes. Blasts set off nearby gunpowder, so trails chain. |
| rubble | powder | What blasts turn rock and dirt into. |
| toxic gas | gas | Heavy (sinks into hollows) and glows. Burns explosively fast. |
| acid | liquid | Eats most things and is used up doing it; sometimes leaves toxic gas. |
| glow goo | liquid | Glows; lights caves. (Bob could absorb it to glow; see [01](01-game-overview.md).) |

### Systems the materials share

- **Temperature.** Every cell has one. Heat flows between neighbours by conductivity. Air relaxes towards a per-cell ambient temperature (`base`), which is how cold and hot biomes stay cold or hot.
- **Burning.** Solids burn in place and throw fire cells; fluids that burn turn straight into fire. Solids need air (or loose ash) next to them to catch or keep burning, so buried or underwater wood smothers; being put out also cools the cell so it can't relight from its own heat.
- **Blasts** (`World.explode`):
  - the inner part of the radius is destroyed;
  - the outer ring is thrown outward, with solids breaking into rubble, wood into ash and ice into snow;
  - everything in range is heated, and fire is scattered;
  - gunpowder in range is lit, which is how trails chain.

  Methane occasionally causes a small one when it ignites. Later this is the hook for mining charges, collapsing bridges and creatures.
- **Pressure.** Connected liquid evens out its level through U-bends and flooded caves (see [03](03-simulation.md)).
- **Drag.** Pushing through liquids and powders is probabilistic. Sinking through water runs at about half speed, and buried light powders rise slowly instead of popping out.

## Backlog

Ideas not built yet, grouped by what they'd add. Effort is relative to the current sim:
- **cheap**: one table entry plus a small rule;
- **medium**: needs a new mechanism;
- **later**: needs creatures, rigid bodies or machines.

### Fire and energy
| Idea | Behaviour | Effort |
|---|---|---|
| Coal | Smoulders for a long time, glows red and gives off lots of heat. Fuel for boilers and heat puzzles. | cheap |
| Magma rock | A solid that slowly heats its neighbours forever: a heat source for hot biomes without lava pools. | cheap |
| Thermite | Burns very hot and melts through steel. | cheap |
| Electricity + copper wire | Sparks travel along wire, metal and water (wet things conduct). Powers lamps, doors and machines, and zaps Bob. The gateway to machines; deserves its own PR. | medium |
| Battery / generator | A source of electricity; a water wheel or steam turbine turns flow and heat into power. | later |

### Water family
| Idea | Behaviour | Effort |
|---|---|---|
| Clay → brick | Wet clay is soft and diggable; firing it makes brick. Building with fire. | cheap |
| Slime / jelly | A wobbly, bouncy, sticky liquid, related to Bob. A preview of how he'll feel. | medium |
| Quicksand | Sand plus water, sucking down anything heavy that sits on it. | cheap |
| Honey / sap | Very viscous; trees leak it; it traps small things. | cheap |
| Tar | Viscous, flammable and sticky. Bob gets slowed and blackened. | cheap |

### Living
| Idea | Behaviour | Effort |
|---|---|---|
| Moss | Slowly spreads over damp rock and glows faintly. Gives caves the stills' coloured surfaces. | cheap |
| Seeds → trees | A seed grows a trunk, then a leaf canopy. | medium |
| Leaf litter | Leaves fall from canopies, pile up, rot into dirt and burn. | cheap |
| Fireflies / bugs | Tiny wandering lights that flee fire. Creatures, not cells. | later |
| Fungus blight | A mushroom variant that eats wood and spreads. | cheap |

### Industrial
| Idea | Behaviour | Effort |
|---|---|---|
| Molten metal / casting | Melt steel to a glowing liquid, pour it and let it cool into new shapes (reuses the lava logic). | cheap |
| Concrete | Pours like a liquid and sets into stone after a while. | cheap |
| Spigots and drains | Tools that pour a material forever, or remove it. They make the sandbox a running machine. | cheap |
| Pressure plates, pistons, conveyors | Machine parts for puzzles. | later |
| Rigid debris | Blast fragments and broken-off rock as real tumbling bodies instead of rubble powder. | later |

### Strange
| Idea | Behaviour | Effort |
|---|---|---|
| Lumen crystal | Grows slowly near glow goo; charges in light and glows in the dark afterwards. | cheap |
| Void / antimatter | Deletes whatever it touches, including itself. A pit hazard. | cheap |
| Ferrofluid | A liquid pulled towards magnets (needs a magnet tool). | medium |
| Cloud | Holds water vapour and rains it out when it's cold enough. A small weather loop with steam. | medium |
| Glow goo ↔ water | Glow goo slowly dilutes into water, glowing fainter. | cheap |

### What Bob will care about

Most of this list exists so that Bob has things to react to (see [01](01-game-overview.md)):
- **Mud and tar** slow him.
- **Salt** shrinks him; **water** swells him.
- **Electricity** jolts him.
- **Glow goo** makes him glow.
- **Slime** is a cousin he could merge with.
- **Blasts** and **lava** split him.
- **Ice** and **brine** set up the freezing puzzles.

When Bob's playground exists, each material gets a "what does it do to Bob" line in this table.
