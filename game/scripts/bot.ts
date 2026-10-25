// Runs the search bot on a scenario: proves its level can be finished, and reports skips,
// softlocks and how forgiving each hard moment is. Too slow for the health check (a minute
// or more of search per level); its routes are kept as replays, which the health check does play.
//   node game/scripts/bot.ts <scenario> [--beam 4] [--budget <s>] [--route <replay file>] [--out <file>] [--keep]
// --route measures a route you already have (a kept replay, a feedback report) instead of searching;
// --out writes the route found; --keep keeps it as game/replays/<scenario>-bot.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { HOLD, REACH, forgiveness, probeSoftlocks, search } from "../src/bot.ts";
import { Play, STEP, runReplay } from "../src/play.ts";
import { type Frame, decode, findReplay } from "../src/replay.ts";
import { parseScenario } from "../src/scenario.ts";
import { loadLevels } from "./load-levels.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const keep = args.includes("--keep") && args.splice(args.indexOf("--keep"), 1).length > 0;
const beam = Number(opt("beam") ?? 4), budget = Number(opt("budget") ?? 600) * 1000, routeFile = opt("route"), out = opt("out");
const [id] = args;
if (!id || args.length > 1) {
  console.log("usage: node game/scripts/bot.ts <scenario> [--beam 4] [--budget <s>] [--route <replay file>] [--out <file>] [--keep]");
  process.exit(1);
}

loadLevels();
const url = new URL(`../scenarios/${id}.json`, import.meta.url);
if (!existsSync(url)) {
  console.log(`there's no game/scenarios/${id}.json`);
  process.exit(1);
}
const { scenario, errors } = parseScenario(id, JSON.parse(readFileSync(url, "utf8")));
if (!scenario) throw new Error(errors.join("; "));
const secs = (ms: number) => `${(ms / 1000).toFixed(0)} s`;

const start = new Play(scenario);
let frames: Frame[], dropped: Play[] = [];
if (routeFile) {
  // A kept replay's JSON, or any text with a replay in it (a feedback report).
  const raw = readFileSync(routeFile, "utf8");
  const kept = routeFile.endsWith(".json") ? (JSON.parse(raw) as { replay?: string }).replay : undefined;
  const { replay, errors } = decode(kept ?? findReplay(raw));
  if (!replay) throw new Error(errors.join("; "));
  frames = replay.frames;
  console.log(`## ${id}: measuring the route in ${routeFile}`);
} else {
  console.log(`## ${id}: searching (beam ${beam}, up to ${secs(budget)})`);
  const r = search(start, { beam, budget, log: (l) => console.log(`  ${l}`) });
  frames = decode(r.best.replay()).replay!.frames;
  dropped = r.dropped;
  const b = r.best;
  console.log(r.done
    ? `\n**Finished** in ${(b.finishedAt * STEP).toFixed(1)} s of play, ${b.outcome().home}% of Bob home: ${secs(r.ms)} of search, ${r.steps} steps.`
    : `\n**Not finished**: the best run got to x ${Math.round(b.bob.main?.cx ?? 0)} of ${b.level.finish.x0} in ${secs(r.ms)} of search. A level the bot can't finish needs a look (or a better bot).`);
  if (!r.done) process.exitCode = 1;
}

// Played again from the start, the route is the same run: a fresh replay is the check.
const play = runReplay(scenario, { scenario: id, frames });
const o = play.outcome();
console.log(`\nReplayed from the start: ${o.finished ? `finishes at ${(o.finished * STEP).toFixed(1)} s` : "doesn't finish"}, ${o.home}% home, ${o.bob}% of Bob, ${play.respawns} respawn(s).`);

const unlit = play.lit.flatMap((l, k) => (l ? [] : [k]));
console.log(`\n### Skips\n${unlit.length ? unlit.map((k) => `- Checkpoint ${k + 1} (x ${play.level.checkpoints[k].x}) is never touched: the route goes round it.`).join("\n") : "- None: the route touches every checkpoint."}`);
if (play.level.bits.length && o.bob < 100) console.log("- (It leaves the lost bits: they're optional.)");

if (dropped.length) {
  console.log("\n### Softlocks\nShort searches for a way on from low places the search passed through, without going back to a checkpoint:");
  for (const s of probeSoftlocks(dropped)) console.log(`- From x ${s.x}, y ${s.y} (frame ${s.frames}): ${s.escaped ? "gets out" : "**stuck**: no way on found"}.`);
}

console.log("\n### Hard moments\nJumps the route fails without, and how far each can be off and still work:\n");
const slack = forgiveness(start, frames);
if (!slack.length) console.log("- None: every jump on the route can be left out.");
else {
  console.log("| At (x, y) | Frame | Slack: early / late | Takeoff margin | Holds that work |\n|---|---|---|---|---|");
  const most = (n: number, cap: number) => (n >= cap ? `${n}+` : `${n}`);
  for (const s of slack) console.log(`| ${s.x}, ${s.y} | ${s.jump.start} | ${most(s.early, REACH)} / ${most(s.late, REACH)} frames | ${s.cells} cells | ${s.minHold} to ${most(s.maxHold, HOLD)} frames |`);
  console.log(`\nSlack is tried up to ${REACH} frames either way, holds up to ${HOLD}. A margin of 0 cells means he's waiting against something when he jumps.`);
}

const text = play.replay();
if (out) writeFileSync(out, text + "\n");
if (keep) {
  const file = new URL(`../replays/${id}-bot.json`, import.meta.url);
  const note = `The search bot's route (beam ${beam}), found by node game/scripts/bot.ts ${id} --keep: ${(o.finished * STEP).toFixed(1)} s.`;
  writeFileSync(file, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), note, replay: text, expect: o }, null, 2) + "\n");
  console.log(`\nKept as game/replays/${id}-bot.json.`);
}
