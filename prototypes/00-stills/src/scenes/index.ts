import type { SceneDef } from "../scene.ts";
import { bobsheet } from "./bobsheet.ts";
import { cavern } from "./cavern.ts";
import { foundry } from "./foundry.ts";
import { grotto } from "./grotto.ts";
import { meadow } from "./meadow.ts";
import { sandbox } from "./sandbox.ts";

export const SCENES: SceneDef[] = [meadow, cavern, foundry, grotto, bobsheet, sandbox];
