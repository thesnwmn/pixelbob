---
date: 2026-10-18
by: producer
build: game
scenario: shell
units: [game-shell, replays]
fun: 3
difficulty: right
frustration: 1
issues: []
---

## What they said
"Smashed it. Liked how when I melted in the lava pit I respawned as a piece I'd left behind."

- The card was enough to know what to try; nothing missing from the feedback form.
- Fun held at 3 because it's a test course: fine for what it is.
- Taking over as a piece left behind: "It's nice. We should make use of it in some ways. But I'm sure we might also find we want to somehow prevent it being abused. Maybe it has a range limit, but it is an interesting idea alongside traditional checkpoints to consider."
- Touch steering on the phone (drag left, tap right) was fine.

Played on Android Chrome at `de3ed83`. The replay reproduces in Node exactly: it finishes at frame 1970 (32.8 s, the report's "33 s"), the first producer replay to do so. At frame 1071 most of Bob melted in the lava pit, and the biggest piece left was one shed earlier, a little way back, which became Bob. He finished with 69% of himself, 51% home. Kept as `game/replays/shell-lava-piece.json`.

## Wrong
Nothing.

## Liked, and would change
- Liked: the piece left behind taking over when the rest of Bob dies. Today that's a side effect of "the biggest piece is Bob". Into [ideas](../../docs/ideas.md#pieces-and-splitting) as a piece-as-checkpoint idea, with a guard against abuse (a range limit), alongside ordinary checkpoints.
- Touch controls and the card: keep as they are.

## Replay
```
pixelbob-replay v1 shell 2130: 0*167 1*2 2*2 3 4 5*2 7 8*162 8j*4 8*51 8j*4 8*90 8j*5 8*41 8j*5 8*43
8j*4 8*32 8j*4 8*30 8j*9 8*20 8j*3 8*42 8j*5 8*42 8j*4 8*43 8j*4 8*32 8j*3 8*43 8j 8*34 8u1 8u3 7u4
5u5 3u6 1u7*2 0u7 -1u8 -2u8*6 -1u8*12 -1ju8*6 -1u8*15 -1ju8*5 -1u8*4 -1ju8*6 -1u8*5 -1ju8*4 -1u8*4
-1ju8*5 -1u8*2 -1ju8 -2ju8*5 -2u8*3 -2ju8 -3ju8*5 -3u8*2 -3ju8*5 -3u8*5 -3ju8*5 -3u8*7 -3ju8*6
-3u8*3 -3ju8*6 -3u8*5 -3ju8*6 -3u8*4 -3ju8*5 -3u8*6 -2u8*52 -3u8*6 -4u8*4 -5u8*52 -4u8 -3u8 1u8 4u8
7u8 8u8*2 8u7 8u5 8u4*2 8u3*74 8ju3*7 8u3*102 8u4*42 8u5 8u6 8u7*6 8u6*2 8u5 8u4 8u1 8*9 8d1 8d2
8d3*3 8d4*2 8d5*2 8d6*11 8d5*3 8d4 8d5*8 8d4 8d3 8d2 8d1*8 8*2 7*3 8*2 8u2 8u3 8u4 8u5*2 8u6*2 8u7*2
8u8*23 8ju8*8 8u8*5 7u8*3 6u8*16 7u8*2 8u8*4 8u7*10 8u8*13 8u7*40 8u8*4 7u8*3 6u8*5 7u8*2 8u8*36
8ju8*9 8u8*328 0*89
```
