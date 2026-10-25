---
title: Make Bob sound squishy
kind: spike
role: prototyper
size: S
status: playtest
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

## Log
- 2026-10-25 the question: can the synth alone (no clips) make Bob sound wet and muffled: a roll that pulses as he turns over, and landings and jumps that squelch, each coloured by the ground? And can a soundboard with a few takes per voice let the producer pick? **Kill criterion** (stated before any code): the producer, after picking from the soundboard, still rates the sound 2 or less and synthesis looks unable to get there, or it costs more than 1 ms a frame on a phone. Measured here: less high end than the spike's mix (the loudness above 1.5 kHz), no clipping, and the listener's cost.
- 2026-10-25 built, #50 ([session](../sessions/2026-10-25-2151-audio-tune.md)). **Verdict, half in.** Wet and muffled: every voice goes through a low-pass (the *muffle*, 1.5 kHz by default, a slider), attacks are 10 to 30 ms instead of 6, and the wet sounds are noise through resonant low-passes that sweep and flutter (a gurgle) instead of sine thuds and blorps. Rendered over the tour, the sound above 1.5 kHz is 13 to 22 dB lower on every leg (the roll leg: -55 to -73 dB), and nothing clips. The goo's low sine throb was the loudest thing in the old mix, peaking at -7 dB on every landing, which is probably the clunky bounce. It's now a quiet gurgle. The roll pulses as his surface turns over: contacts made (and half of those lost), about 3.3 a frame at speed, add up to a pulse every 40, so 3 to 5 pulses a second, fewer on ice. Each ground colours the roll, landing and jump: grass and moss pat, rock is drier and about 7 dB quieter, ice about 16 dB quieter and seldom, resin and gum the wettest. The soundboard (`?board`) has three takes each for roll (pat, patter, smear), landing (squelch, plop, splat) and jump (unstick, slurp, pop), with peaks within about 5 dB of each other on soft ground. Tapping a take plays it on the chosen ground and makes it live, and the picks go in the link. The listener costs 18 µs a frame in Node and about 130 µs in slow headless Chromium. Whether it sounds like him is the producer's call: pick from the board, rate it, and the picks become the defaults. I couldn't listen; all of this is judged from levels.
