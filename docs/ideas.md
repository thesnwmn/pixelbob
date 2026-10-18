# Ideas

Ideas raised while building and playing the prototypes that aren't built yet, so they aren't lost. Gameplay first. Where an idea came from a playtest of the Bob playground, it says so; the rest come from the design docs. What *is* built is in [Game overview](game-overview.md#bob) and [Bob](bob.md).

## Pieces and splitting

Today he only splits when hazards cut him (spikes, hard landings, a snapped thread), and you keep steering the piece you had.

- **Switch pieces.** Let the player hop control to another piece: Q / R or the bumpers, or tap a piece on touch. Raised in playtest ("in time we'll let the player switch").
- **A split action.** Split on purpose: E / X, or swipe through Bob on touch. Which way it cuts, and how big the halves are, is open.
- **A hard edge that halves him.** A blade or sharp lip that cuts him into two pieces big enough to steer, rather than spikes' crumbs.
- **Leave a piece behind.** Split off a chunk to hold a pressure plate while the rest goes on, then go back for it.
- **A piece as a checkpoint.** When the rest of Bob dies, the biggest piece left takes over: it already happens, because the biggest piece is always Bob. Raised in playtest as a good thing ([2026-10-18](../studio/playtests/2026-10-18-0300-shell-lava-piece.md)): use it on purpose, alongside ordinary checkpoints, with a guard against abuse (a range limit, say, so a piece left at the start isn't a free life).
- **Which piece the camera follows**, and how the HUD shows the pieces and their sizes.

## Climbing

Built: moss, resin and gum, coloured by grip; push in to hold, up and down to climb; he hangs like a drop.

- **Corners and ledges.** Grip an outside corner and pull himself up and over the top edge, instead of having to roll off the top of the wall.
- **Ceilings.** Gum on a ceiling to hang from and shuffle along; a cousin of dangling.
- **Vines** as something to climb or cling to.
- **Tacky surfaces as level language.** The colours read as grip levels, so a level can mix them: a moss ramp that's fine, a resin face that needs you to push in, a gum wall that's the only way up. Hot Bob grips differently from cold, which could be a puzzle.
- **Crumbs as skill.** He sheds a few crumbs on a climb, fewer when you climb cleanly. Raised in playtest as a good thing: room for player skill. Worth showing (a per-climb tally, or a score for a clean climb).

## Dangling and drips

Built: runny and holding still, he tenses and hangs off a ledge; down lowers him on a thread; too far and the thread snaps and a drop falls.

- **Reach down for something.** Lower himself to a lower ledge, or to a lost bit below, and pick it up.
- **Reel back in.** Pull the thread back up fast enough to save the drop before it snaps. Asked in playtest; not a designed move yet.
- **Shed mass on purpose.** Drip a bit off to get small enough for a gap, or to drop onto a plate below.
- **A smaller drop.** The drop at the end was a little big in playtest. Not a deal breaker: the value is where the thread breaks, not the lump.

## Temperature puzzles

Heat comes only from visible sources (braziers, lava, ice, snow).

- **Hot Bob melts snow and ice walls** to open a way.
- **Frozen Bob freezes water** into a platform or a bridge as he crosses.
- **Frozen and rigid**: wedge a door, press a switch, or be a platform for nothing else.
- **Thaw to jump**: frozen can't jump, so a warm-up is the key to a jump (the course's brazier before the spikes already does this).
- **Melt to drip through a grate**, then cool to re-form below.
- **Hot grips differently from cold** on tacky surfaces (see Climbing).

## Score and levels

Built: the course scores the % of Bob that reaches the finish; lost bits wait where they fell.

- **Hidden bits**: bits of Bob tucked in narrow pits and corners, so collecting him is a route choice. The course's pit (pour in while runny) is the first.
- **Optional areas** like the climbing gym: more of Bob for the player who goes looking.
- **Water as an escapable trap**, not instant death; **lava as a jump challenge**.
- **Should loose droplets count** towards the finish, or only pieces? (Open question in [Bob](bob.md#open-questions).)
- **Size gates**: slots that normal Bob can't fit but runny Bob can; too small to push something, too big to fit.

## Collectables and challenges

From the producer, 2026-10-18: probably much later, but it should shape how levels are designed now. Two halves: spaces that hide things, and harder optional challenges. Hidden bits and optional areas (above) are the first of each.

- **Hiding with the sim.** Things are hidden by what the world is made of, not by invisible walls: a crumbly wall that gives when frozen Bob hits it, sand that drains away, ice that melts open under a brazier, a curtain of water to pass through, a dark cave only a glowing Bob lights. The player finds them by reading materials, so finding teaches the material language.
- **Places only one Bob reaches.** A slot only runny Bob pours through, a ledge only a small piece climbs to, a gum ceiling only warm Bob holds. The secret is a state, not a key.
- **What gets collected.** Either more of Bob (it's already the score, but it makes him bigger, so it can lock him out of slots) or something that isn't Bob (a token, a seed) that changes nothing in play. Open: one, the other or both.
- **Optional challenges.** Per level, on top of finishing: arrive whole (100%), finish without freezing, finish in one piece (no splits), or take the hard route (the gum ceiling over the spikes instead of the path round). They ask more of the same verbs rather than adding new ones.
- **For level design now.** Leave room for this: corners, pockets and alternative routes off the main path in The Green's levels, even before there's anything to put in them.
- **Scores and badges.** From the producer's playtest of the first Green level (2026-10-18): a score, and a badge for finishing a level with as much of Bob as possible, so a lost bit at the bottom of a ravine is worth the climb back out.
- **Not this:** a collectathon that pads levels, or secrets that need a guide. A player who never looks should still have a complete game.

## From the design, not built yet

- **Absorb**: water swells him (bigger, heavier, translucent: weigh down plates, dilute toxins, squeeze it out over fire for steam); glow goo makes him a light that fades (light caves, lure creatures).
- **Oily**: slides fast and burns.
- **Electricity** through water and metal; **blasts** that splash him.
- **Pushing liquids aside** as he moves through them (today he only feels buoyancy and drag).
- **Tar and honey traps**, quicksand, slime he merges with to grow (more in [Bob](bob.md#backlog-materials-through-bobs-eyes) and [Materials](materials.md#backlog)).
- **Salt shrinks him; acid dissolves him.**
- **Pour sand into a pit** to make a bridge; dig a channel to drain a pool onto lava for stone.

## Feel and presentation

- **Camera**: follow with look-ahead, polish for climbing and dangling (looking down).
- **Air steering**: physically he can't; a little would help on touch screens.
- **Roll or crawl** as the default way to move (both are in the playground).
- **Forgiveness**: coyote time and jump buffering, so his sloppiness is forgiving rather than punishing.
- **Tacky surfaces** could read a little brighter on their lit faces, so grip shows in dark caves.
