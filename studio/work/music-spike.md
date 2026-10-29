---
title: Can the music come from the game?
kind: spike
role: prototyper
size: S
status: doing
pr: 51
milestone: m1-green-alpha
needs: []
---

## Why
The producer wants atmosphere to carry the opening, music included ([taste notes](../producer.md#taste-notes)), and chose generative music for the spike (2026-10-19, `/director`). The [audio spike](audio-spike.md) synthesises Bob's sounds from the sim's numbers with no clips. Music could work the same way: generated live, and following the game rather than playing over it, since nothing about Bob should switch.

## Done when
- A verdict: can Web Audio generate calm, looping music for The Green that follows the game continuously, cheaply enough for a phone, and does the producer want to keep it? It might follow how fast Bob moves, how high he is, heat nearby, his temperature, or a hard moment such as winding up a big jump. A page in `prototypes/` plays it over green-1-hills.
- It sits with the audio spike's sounds without fighting them: Bob's sounds stay readable.
- Kill criterion: the producer wouldn't keep it after a few minutes in green-1-hills, or it costs more than 1 ms a frame on a phone.

## Not this
Composed or licensed tracks, other worlds' music, final mixing, menus and the title.

## Log
- 2026-10-29 the question: can Web Audio generate calm, looping music for The Green live, with no clips, that follows the game continuously (how fast Bob goes, how high he is, winding up a jump, being in water, how far through the level he is), sits under Bob's own sounds from [audio-tune](audio-tune.md) without fighting them, and costs well under 1 ms a frame? Built as `prototypes/05-music/`: green-1-hills from the game, with Bob's voices and a generative score on one audio context. **Kill criterion** (stated before any code): the producer wouldn't keep it after a few minutes in green-1-hills, or the score and its scheduling cost more than 1 ms a frame (measured in Node and in headless Chromium; the phone is the producer's).

- 2026-10-29 built, #51 ([session](../sessions/2026-10-29-1030-music-spike.md)). **Verdict, half in.** Web Audio can do it: `prototypes/05-music/` plays green-1-hills (the game's own level, `play.ts` and a kept run) with a score written live, a sixteenth at a time, and Bob's voices from the audio spike on the same audio context. Four chords in D (Dmaj9, Bm7, Gmaj7, A7sus4, two bars each) under a pad, a sine bass, a kalimba-like melody walking the pentatonic scale, an arpeggio and an FM bell. The game moves eight numbers, each eased so it glides (the biggest change in one frame over the kept run is 0.1, the charge): speed thickens the melody's rhythm and opens the pad, height over the hills lifts its register, the air holds its notes, winding up climbs an arpeggio, water darkens and slows it all, warmth brightens the pad, progress brings in the bass over the first third and the bell towards the finish, and resting thins the melody to the pad. Nothing switches: each part's notes get likelier, louder or higher. Over the kept run the melody goes from 4 notes in the first quarter to 13 to 16 in each of the others. Cost: following and conducting take about 10 µs a frame in Node (57 µs at the 99th percentile); the page's music readout (the notes it schedules too) is the per-frame number to watch on a phone. Synthesis runs on the audio thread: rendered offline in headless Chromium, the music alone runs 15 times faster than real time, Bob's voices 35, both 11. So the band costs about twice what Bob does, mostly the hall (a 3 s hall was 11 times; 2 s now). It sits under Bob: about 3 dB quieter overall and 2 dB quieter at 200 to 600 Hz, where his squelches are (a dip there, and it ducks for a moment when he lands or jumps). Whether it's calm, whether it follows him in a way you feel, and whether you'd keep it after a few minutes is the producer's call, as is the phone half of the cost: *Listen* plays the kept run, *Mix* turns each part off and sets the levels (saved in the link). I couldn't listen; this is judged from levels and counts.
