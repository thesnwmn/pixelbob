// Plays every replay in game/replays/ headless and compares each outcome with what it
// expects. The health check runs this (`code/replays`); Node strips the types.
//   node game/scripts/replays.ts            check them all
//   node game/scripts/replays.ts --update   write the outcomes they come to now (when a change means to alter them)
//   node game/scripts/replays.ts --add <id> <file> <note…>   keep a new one, from a file holding its text (a pasted feedback report will do)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { checkReplay } from "../src/play.ts";
import { type ReplayFile, decode, findReplay, parseReplayFile } from "../src/replay.ts";
import { type Scenario, parseScenario } from "../src/scenario.ts";

const root = new URL("../", import.meta.url);
const json = (dir: string) => {
  const url = new URL(`${dir}/`, root);
  return existsSync(url) ? readdirSync(url).filter((f) => f.endsWith(".json")).sort().map((f) => ({ id: f.replace(/\.json$/, ""), url: new URL(f, url) })) : [];
};
const read = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));

const scenarios = new Map<string, Scenario>();
for (const { id, url } of json("scenarios")) {
  const { scenario } = parseScenario(id, read(url));
  if (scenario) scenarios.set(id, scenario);
}

const write = (url: URL, f: ReplayFile, text: string) =>
  writeFileSync(url, JSON.stringify({ note: f.note, replay: text, expect: f.expect }, null, 2) + "\n");

const [flag, ...rest] = process.argv.slice(2);

if (flag === "--add") {
  const [id, path, ...words] = rest;
  const text = findReplay(path ? readFileSync(path, "utf8") : "");
  const { replay, errors } = decode(text);
  const { outcome, problems } = replay
    ? checkReplay({ id, note: "", replay, expect: { frames: 0, finished: 0, home: 0, bob: 0 } }, scenarios)
    : { outcome: undefined, problems: errors };
  const kept = { note: words.join(" "), replay: text, expect: outcome };
  const bad = outcome ? parseReplayFile(id ?? "", kept).errors : problems;
  if (bad.length) {
    console.log(bad.join("\n"));
    process.exit(1);
  }
  writeFileSync(new URL(`replays/${id}.json`, root), JSON.stringify(kept, null, 2) + "\n");
  console.log(`game/replays/${id}.json: ${JSON.stringify(outcome)}`);
  process.exit(0);
}

let bad = 0;
const files = json("replays");
for (const { id, url } of files) {
  const raw = read(url) as { replay?: string };
  const { file, errors } = parseReplayFile(id, raw);
  const { outcome, problems } = file ? checkReplay(file, scenarios) : { outcome: undefined, problems: errors };
  if (flag === "--update" && file && outcome) {
    write(url, { ...file, expect: outcome }, raw.replay!);
    console.log(`game/replays/${id}.json: ${JSON.stringify(outcome)}`);
    continue;
  }
  if (problems.length) bad++;
  for (const p of problems) console.log(`game/replays/${id}.json: ${p}`);
}
console.log(bad ? `${bad} of ${files.length} replays differ` : `${files.length} replay${files.length === 1 ? "" : "s"}`);
process.exitCode = bad ? 1 : 0;
