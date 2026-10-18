// The spike: a beam search over short input "moves" in the deterministic sim, branching
// from snapshots, to find a run that finishes a scenario. Node strips the types:
//   node prototypes/03-bot-search/src/search.ts [scenario=shell] [beam=4] [budget s=600] [out.txt]
// Prints progress, then the replay it found (the game's format), checked by playing it
// again from the start.
import { readFileSync, writeFileSync } from "node:fs";
import { Play, runReplay } from "../../../game/src/play.ts";
import { type Frame, decode, encode } from "../../../game/src/replay.ts";
import { parseScenario } from "../../../game/src/scenario.ts";
import { type Snapshot, restore, snapshot } from "./snapshot.ts";

const [id = "shell", beamArg = "4", budgetArg = "600", out = ""] = process.argv.slice(2);
const BEAM = Number(beamArg), BUDGET = Number(budgetArg) * 1000;
const { scenario, errors } = parseScenario(id, JSON.parse(readFileSync(new URL(`../../../game/scenarios/${id}.json`, import.meta.url), "utf8")));
if (!scenario) throw new Error(errors.join("; "));

/** A move: 20 frames of one input, the jump held for the first 8. */
const LEN = 20;
const f = (move: number, jump = false, down = 0, up = 0): Frame => ({ move, jump, down, up });
const MOVES: { name: string; frame(i: number): Frame }[] = [
  { name: "right", frame: () => f(1) },
  { name: "right+jump", frame: (i) => f(1, i < 8) },
  { name: "half right", frame: () => f(0.5) },
  { name: "half right+jump", frame: (i) => f(0.5, i < 8) },
  { name: "wait", frame: () => f(0) },
  { name: "left", frame: () => f(-1) },
  { name: "jump", frame: (i) => f(0, i < 8) },
  { name: "right+up", frame: () => f(1, false, 0, 1) },
];

interface Node {
  snap: Snapshot;
  frames: Frame[];
  score: number;
  finished: number;
}

/** Further right is better; losing bits of Bob costs a little; finishing beats everything, sooner better. */
function score(play: Play): number {
  const p = play.bob.main;
  if (!p) return -1e9;
  const kept = play.bob.count / play.bob.total;
  return play.finishedAt ? 1e6 - play.finishedAt : p.cx + 60 * kept;
}

const t0 = performance.now();
const play = new Play(scenario);
let steps = 0;
let beam: Node[] = [{ snap: snapshot(play), frames: [], score: score(play), finished: 0 }];
let found: Node | undefined;
for (let depth = 0; !found && performance.now() - t0 < BUDGET; depth++) {
  const children: Node[] = [];
  for (const node of beam)
    for (const move of MOVES) {
      restore(play, node.snap);
      const frames = node.frames.slice();
      for (let i = 0; i < LEN; i++) {
        const fr = move.frame(i);
        play.step(fr);
        frames.push(fr);
        steps++;
      }
      children.push({ snap: snapshot(play), frames, score: score(play), finished: play.finishedAt });
    }
  // Keep the best, but not two that ended up in the same place (a cheap way to keep the beam varied).
  children.sort((a, b) => b.score - a.score);
  const seen = new Set<number>();
  beam = [];
  for (const c of children) {
    const key = Math.round(c.score / 4);
    if (seen.has(key)) continue;
    seen.add(key);
    beam.push(c);
    if (beam.length === BEAM) break;
  }
  found = beam.find((n) => n.finished);
  if (depth % 10 === 0 || found)
    console.log(`depth ${depth}: ${beam[0].frames.length} frames, best x ${beam[0].finished ? "finished" : Math.round(beam[0].score)}, ${((performance.now() - t0) / 1000).toFixed(0)} s, ${Math.round(steps / ((performance.now() - t0) / 1000))} steps/s`);
}

const secs = (performance.now() - t0) / 1000;
if (!found) {
  console.log(`no route in ${secs.toFixed(0)} s (${steps} steps): killed`);
  process.exit(1);
}
const text = encode(id, found.frames);
const again = runReplay(scenario, decode(text).replay!).outcome();
console.log(`found in ${secs.toFixed(0)} s, ${steps} steps: finishes at frame ${found.finished} (${(found.finished / 60).toFixed(1)} s of play)`);
console.log(`replayed from the start: ${JSON.stringify(again)} ${again.finished === found.finished ? "(same)" : "(DIFFERENT)"}`);
if (out) writeFileSync(out, text + "\n");
