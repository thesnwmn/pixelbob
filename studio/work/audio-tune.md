---
title: Make Bob sound squishy
kind: spike
role: prototyper
size: S
status: doing
pr: 50
milestone: m1-green-alpha
needs: [audio-spike]
---

## Why
The [audio spike](audio-spike.md) works: eight voices from the sim's numbers, no clips, clean on a phone, and the producer keeps all of them. But the sound rates 2: "a bit harsh and not squishy enough. I'd like a more organic sound. Roll is very continuous. Bounce is very clunky" ([playtest](../playtests/2026-10-21-1739-audio-spike.md)). Squishy means wet and muffled: less hiss and high end, softer attacks, more low, damp squelch, like a hand in slime.

## Done when
- The voices in `prototypes/04-audio/` reworked to sound wet and muffled: less white-noise hiss, lower filters, softer attacks, more squelch.
- The roll comes in pulses as his surface turns over onto the ground (from the sim: contacts made and lost, say), sits well back in the mix, and is heard on some ground more than others.
- Landing and jump are squelches, not a thud and a blorp, and each is coloured by the ground he's on, like the roll.
- A soundboard to play with: a few options for each voice (roll, landing, jump at least), each playable on its own and live while Bob moves, so the producer can listen, compare and pick. The picks become the defaults.
- Still continuous with the cues (nothing about Bob switches), still clean on a phone.
- A playtest: the producer picks from the soundboard and says it sounds like him. Kill criterion: after this pass, the sound still rates 2 or less, and synthesis alone looks unable to get there (then clips mixed in are the next question).

## Not this
Building sound into the game (the Engineer's next unit, once this sounds right), music, the world's own sounds.
