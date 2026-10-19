---
title: What does Bob sound like?
kind: spike
role: prototyper
size: S
status: doing
pr: 43
milestone: m1-green-alpha
needs: []
---

## Why
The milestone asks for an audio prototype. Bob is goo in a simulated world, so the sound could come from the sim (squelch from his deformation, splashes from water cells, sizzle from heat) rather than from clips.

## Done when
- A verdict: can Web Audio synthesise Bob's rolling, landing, splashing and sizzling from the sim's numbers, cheaply enough for a phone, and does it sound good? With a page in `prototypes/` the producer can hear.
- Kill criterion: nothing the producer would keep after an hour of trying.

## Not this
Music, final mixing.

## Log
- 2026-10-19 the question: can Bob's sound be synthesised live with Web Audio from numbers the sim and Bob already have (contacts, impact speeds, charge, squash, wetness, heat, boiling), with no clips, cheaply enough for a phone, and does it sound like him? Built as `prototypes/04-audio/`, the Bob playground plus a synth. **Kill criterion** (stated before any code): the producer, after trying it, wants none of the voices kept, or the reading and synthesis cost more than 1 ms a frame on a phone.
