---
title: Can the music come from the game?
kind: spike
role: prototyper
size: S
status: doing
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

