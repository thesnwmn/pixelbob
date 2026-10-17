import type { SceneDef } from "../scene.ts";
import { bobsheet } from "./bobsheet.ts";
import { caverns } from "./worlds/caverns.ts";
import { foundry } from "./worlds/foundry.ts";
import { green } from "./worlds/green.ts";
import { grotto } from "./worlds/grotto.ts";
import { ruins } from "./worlds/ruins.ts";
import { sump } from "./worlds/sump.ts";

/** One shot per world (docs/11-worlds.md), in the order you play them, then Bob's states. */
export const SCENES: SceneDef[] = [green, caverns, ruins, grotto, foundry, sump, bobsheet];
