// How far Bob gets rolling, and hopping (jump held 8 frames in every 20), from the start of
// the test course: node prototypes/03-bot-search/src/speed.ts
import { readFileSync } from "node:fs";
import { Play } from "../../../game/src/play.ts";
import { parseScenario } from "../../../game/src/scenario.ts";

const { scenario } = parseScenario("shell", JSON.parse(readFileSync(new URL("../../../game/scenarios/shell.json", import.meta.url), "utf8")));
for (const [name, jump] of [["roll", () => false], ["hop", (i: number) => i % 20 < 8]] as const) {
  const play = new Play(scenario!);
  const x0 = play.bob.main!.cx, at: string[] = [];
  for (let i = 1; i <= 480; i++) {
    play.step({ move: 1, jump: jump(i - 1) });
    if (i % 240 === 0) at.push(`${i / 60} s: ${Math.round(play.bob.main!.cx - x0)} cells`);
  }
  console.log(`${name}: ${at.join(", ")}`);
}
