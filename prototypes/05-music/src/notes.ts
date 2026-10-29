// Plays a kept replay of green-1-hills in Node through the follower and the conductor, and prints
// what the music did: the mood and the notes written, a line every two seconds, the notes by part
// over each quarter of the level, the biggest jump any mood number made in one frame, and what the
// follower and conductor cost a frame.  node src/notes.ts [replay id, default green-1-hills-run]
import { readFileSync } from "node:fs";
import { Play } from "../../../game/src/play.ts";
import { parseReplayFile } from "../../../game/src/replay.ts";
import { parseScenario } from "../../../game/src/scenario.ts";
import { loadLevels } from "../../../game/scripts/load-levels.ts";
import { Follower, MOOD_KEYS, type Mood } from "./follow.ts";
import { Conductor, type Note, PARTS, type Part } from "./score.ts";

const id = process.argv[2] ?? "green-1-hills-run";
const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
loadLevels();
const { file, errors } = parseReplayFile(id, read(`../../../game/replays/${id}.json`));
if (!file) throw new Error(errors.join("; "));
const sid = file.replay.scenario;
const { scenario } = parseScenario(sid, read(`../../../game/scenarios/${sid}.json`));
if (!scenario) throw new Error(`scenario ${sid}`);

const play = new Play(scenario);
const { level } = play;
const follower = new Follower(level.world, play.start().x, level.finish.x0);
const conductor = new Conductor(scenario.seed);
const quarter: Record<Part, number>[] = [0, 1, 2, 3].map(() => Object.fromEntries(PARTS.map((p) => [p, 0])) as Record<Part, number>);
const jump: Mood = { ...follower.mood };
for (const k of MOOD_KEYS) jump[k] = 0;
let prev = { ...follower.mood }, line: Note[] = [];
const cost: number[] = [];
const bar = (v: number) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor(v * 8))];

console.log(`${id}: ${file.replay.frames.length} frames of ${sid}\n`);
console.log("   s     x   " + MOOD_KEYS.map((k) => k.slice(0, 4).padEnd(5)).join("") + "  notes in the last 2 s");
const frames = file.replay.frames;
for (let i = 0; i < frames.length; i++) {
  play.step(frames[i]);
  const t0 = performance.now();
  // The page writes notes 0.12 s ahead of the audio clock; here the clock is the frame.
  const m = follower.follow(play.bob, 1 / 60);
  const notes = conductor.advance(m, (i + 1) / 60 + 0.12);
  const dt = (performance.now() - t0) * 1000;
  cost.push(dt);
  const q = Math.min(3, Math.floor(m.progress * 4));
  for (const n of notes) quarter[q][n.part]++;
  line.push(...notes);
  for (const k of MOOD_KEYS) jump[k] = Math.max(jump[k], Math.abs(m[k] - prev[k]));
  prev = { ...m };
  if ((i + 1) % 120 === 0) {
    const by = PARTS.map((p) => `${p} ${line.filter((n) => n.part === p).length}`).join(", ");
    console.log(`${((i + 1) / 60).toFixed(0).padStart(4)}  ${(play.bob.main?.cx ?? 0).toFixed(0).padStart(4)}   ` + MOOD_KEYS.map((k) => `${bar(m[k])}${m[k].toFixed(2).slice(1)} `).join("") + ` ${by}`);
    line = [];
  }
}
console.log(`\nfinished: ${play.finishedAt ? `${(play.finishedAt / 60).toFixed(1)} s` : "no"}`);
console.log("\nnotes by quarter of the level:");
for (const [i, q] of quarter.entries()) console.log(`  ${i + 1}: ` + PARTS.map((p) => `${p} ${q[p]}`).join(", "));
console.log("\nthe biggest change in one frame (0..1): " + MOOD_KEYS.map((k) => `${k} ${jump[k].toFixed(3)}`).join(", "));
cost.sort((a, b) => a - b);
const avg = cost.reduce((a, b) => a + b, 0) / cost.length;
console.log(`\nfollow + conduct: ${avg.toFixed(1)} µs a frame on average, ${cost[Math.floor(cost.length * 0.99)].toFixed(0)} µs at the 99th percentile (the first frames warm up the JIT)`);
