---
title: Should hopping be twice as fast as rolling?
from: prototyper
status: answered
blocks: [hop-tune]
default: Leave it as it is, and the bots measure levels with hopping allowed.
gated: true                 # how Bob moves is his character
---

The [bot search spike](../work/bot-search-spike.md) found that chaining hops moves Bob more than twice as fast as rolling: 495 cells in 4 s against 222 on the opening ground of the test course. The bot's best route is almost all hops, and finishes the course in 13.5 s, where you took 33 s rolling.

It matters for the levels and the bots: if hopping is the fastest way everywhere, every level is timed and measured around it, and rolling is only for when you can't jump.

Options:
- **Leave it** (default): bunny-hopping is part of Bob's character, a skill a good player finds. The bots measure with it.
- **Even them out**: make a hop cost speed (less push in the air, or a landing that soaks up speed), so rolling is as fast on flat ground and hops are for obstacles. The Engineer tunes it and you playtest it.
- **Look first**: watch the bot's route in the spike's preview (`…/preview/pr-27/03-bot-search/`) and decide then.

Answer with `/needs-me` or `/director`.

## Answer
2026-10-18, in `/needs-me`: "I'd like it to be slightly less, probably different. So slow hopping slightly." Hopping stays a way to go faster, but by less: the [hop-tune](../work/hop-tune.md) unit slows it a little, and you playtest it.

