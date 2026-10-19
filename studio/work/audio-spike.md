---
title: What does Bob sound like?
kind: spike
role: prototyper
size: S
status: playtest
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
- 2026-10-19 built, #43 ([session](../sessions/2026-10-19-1924-audio-spike.md)). **Verdict, half in.** Eight voices come from numbers Bob already has, with no clips: roll (by ground), goo wobble, charge, landing, jump, water and bubbles, sizzle, and cuts. The page's own work is cheap: reading the cues and scheduling the synth take about 20 µs a frame in Node and 95 µs in a slow headless browser. The synthesis itself runs on the audio thread, which that number doesn't count. It rendered 49 times faster than real time offline on a desktop, but **not measured on a phone**. So the phone half of the kill criterion waits on the producer playing the preview on one, listening for crackles with every voice on. Whether it sounds like him is the producer's call too: toggle each voice, keep or drop each one. If any survive, the Engineer rebuilds the listener (no DOM) and synth in the game. Bob's model would then need to expose what the listener reaches into today: the stretch and banked charge (for jumps), the breaks and losses counters, and contact materials. The world gets its own sounds next (water, fire, steam). `render.ts` (Playwright, offline to a WAV) is the spike's own script, not a studio tool.
