// The search bot: proves a level can be finished, finds skips and softlocks, and measures how
// forgiving its hard moments are. A beam search over short input moves in the deterministic
// sim, branching from copies of the run (Play.copy) rather than replaying from the start.
// No DOM: game/scripts/bot.ts runs it in Node. What it learned from the spike:
// studio/work/bot-search-spike.md.
import { type Play, STEP } from "./play.ts";
import type { Frame } from "./replay.ts";

const f = (move: number, jump = false): Frame => ({ move, jump, back: false, down: 0, up: 0 });
const run = (n: number, frame: (i: number) => Frame): Frame[] => Array.from({ length: n }, (_, i) => frame(i));

/** A move: a short fixed run of input. The jump held for a few frames is a tap or a hop, for 22 a full charge. */
export interface Move { name: string; frames: Frame[] }
export const MOVES: Move[] = [
  { name: "right", frames: run(20, () => f(1)) },
  { name: "right, tap", frames: run(20, (i) => f(1, i < 4)) },
  { name: "right, hop", frames: run(20, (i) => f(1, i < 8)) },
  { name: "right, charge", frames: run(30, (i) => f(1, i < 22)) },
  { name: "half right", frames: run(20, () => f(0.5)) },
  { name: "charge", frames: run(30, (i) => f(0, i < 22)) },
  { name: "wait", frames: run(20, () => f(0)) },
  { name: "left", frames: run(20, () => f(-1)) },
  { name: "left, hop", frames: run(20, (i) => f(-1, i < 8)) },
];

/**
 * How far along a run is: further right is better (the levels so far run left to right),
 * losing bits of Bob costs a little, finishing beats everything and sooner is better. It
 * doesn't reward checkpoints, so a route that goes round one shows up as a skip.
 */
export function progress(play: Play): number {
  const p = play.bob.main;
  if (!p) return -1e9;
  if (play.finishedAt) return 1e6 - play.finishedAt;
  return p.cx + 60 * (play.bob.count / play.bob.total);
}

interface Node { play: Play; score: number }

export interface SearchOptions {
  beam?: number;
  /** Give up after this long, in ms. */
  budget?: number;
  /** Give up after this many moves without the best run getting further. */
  patience?: number;
  /** Stop when this says the run is done (default: it reached the finish). */
  goal?: (play: Play) => boolean;
  /** Told about the search every ten moves. */
  log?: (line: string) => void;
}

export interface SearchResult {
  /** The best run found: finished, or as far as it got. */
  best: Play;
  done: boolean;
  steps: number;
  ms: number;
  /** Runs that went somewhere the beam dropped, deepest down first: where to look for softlocks. */
  dropped: Play[];
}

/**
 * Beam search from `start` (which it leaves alone): every move from each of the `beam` best runs,
 * keeping the best that ended up in different places, until one reaches the goal.
 */
export function search(start: Play, o: SearchOptions = {}): SearchResult {
  const width = o.beam ?? 4, budget = o.budget ?? 600_000, patience = o.patience ?? 15;
  const goal = o.goal ?? ((p: Play) => p.finishedAt > 0);
  const t0 = performance.now();
  let steps = 0, beam: Node[] = [{ play: start.copy(), score: progress(start) }], stale = 0, top = beam[0].score;
  const dropped: Play[] = [];
  for (let depth = 0; ; depth++) {
    const children: Node[] = [];
    for (const node of beam)
      for (const move of MOVES) {
        const play = node.play.copy();
        for (const fr of move.frames) play.step(fr);
        steps += move.frames.length;
        children.push({ play, score: progress(play) });
        if (goal(play)) return { best: play, done: true, steps, ms: performance.now() - t0, dropped };
      }
    // Keep the best, but not two in the same place (which keeps the beam varied).
    children.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    beam = [];
    for (const c of children) {
      const p = c.play.bob.main;
      const key = p ? `${Math.round(p.cx / 4)},${Math.round(p.cy / 4)}` : "gone";
      if (seen.has(key)) continue;
      seen.add(key);
      if (beam.length < width) beam.push(c);
      // One of the rest, the lowest down, kept to probe for softlocks (pits are where they hide).
      else if (p && depth % 4 === 0 && p.cy > Math.max(...beam.map((n) => n.play.bob.main?.cy ?? 0)) + 12) dropped.push(c.play), (dropped.length > 40 && dropped.shift());
    }
    if (beam[0].score > top + 1) (top = beam[0].score), (stale = 0);
    else if (++stale >= patience || performance.now() - t0 > budget)
      return { best: beam[0].play, done: false, steps, ms: performance.now() - t0, dropped };
    if (depth % 10 === 0) o.log?.(`move ${depth}: ${(beam[0].play.frame * STEP).toFixed(1)} s in, best x ${Math.round(beam[0].score)}, ${((performance.now() - t0) / 1000).toFixed(0)} s, ${Math.round(steps / ((performance.now() - t0) / 1000))} steps/s`);
  }
}

export interface Softlock {
  /** Where Bob was when the probe started. */
  x: number;
  y: number;
  /** Whether he got out (further right, or to the finish) without going back to a checkpoint. */
  escaped: boolean;
  /** The run up to there, as frames. */
  frames: number;
}

/**
 * From each of `from` (deepest first, at most `limit` of them, one per `spacing` cells), a short
 * search for a way on: `reach` cells further right, or the finish, without pressing back or
 * losing all of him. One that finds none is a softlock: he's stuck until he gives up.
 */
export function probeSoftlocks(from: Play[], o: { limit?: number; spacing?: number; reach?: number; budget?: number } = {}): Softlock[] {
  const limit = o.limit ?? 6, spacing = o.spacing ?? 100, reach = o.reach ?? 60;
  const picked: Play[] = [];
  for (const p of [...from].sort((a, b) => b.bob.main!.cy - a.bob.main!.cy)) {
    if (picked.length >= limit) break;
    if (picked.every((q) => Math.abs(q.bob.main!.cx - p.bob.main!.cx) > spacing)) picked.push(p);
  }
  return picked.map((play) => {
    const { cx: x, cy: y } = play.bob.main!, respawns = play.respawns;
    const r = search(play, { beam: 3, patience: 6, budget: o.budget ?? 60_000, goal: (p) => p.respawns === respawns && (p.finishedAt > 0 || (p.bob.main?.cx ?? 0) >= x + reach) });
    return { x: Math.round(x), y: Math.round(y), escaped: r.done, frames: play.frame };
  });
}

/** A run of frames with the jump held: [start, end). */
export interface Jump { start: number; end: number }

export function jumps(frames: Frame[]): Jump[] {
  const out: Jump[] = [];
  for (let i = 0; i < frames.length; i++)
    if (frames[i].jump && !frames[i - 1]?.jump) {
      let j = i;
      while (j < frames.length && frames[j].jump) j++;
      out.push({ start: i, end: j });
    }
  return out;
}

export interface Slack {
  jump: Jump;
  /** Where he was when the jump started, in cells. */
  x: number;
  y: number;
  /** Frames earlier and later the jump could have started and still worked (0 if only exactly on time), up to `REACH`. */
  early: number;
  late: number;
  /** How far he travels over that window, in cells: the margin on where to take off. */
  cells: number;
  /** The shortest and longest hold that still works, in frames (up to `HOLD`). */
  minHold: number;
  maxHold: number;
}

/**
 * How forgiving each hard moment of a route is. A jump is a hard moment if Bob can't get on
 * without it: leaving it out, he never gets to where the route was just before its next jump
 * (within `near` cells across, and no lower than the route went), even given extra time to
 * roll there. The rest of the route plays as it was up to that next jump, then he just rolls
 * on, so a later jump can't rescue one that failed. For each hard jump, how many frames
 * earlier or later it could have started, how many cells of ground that is, and the range of
 * holds that work. Jumps that don't matter (most of a route of hops) are left out.
 */
export const REACH = 20, HOLD = 40;
export function forgiveness(start: Play, frames: Frame[], o: { near?: number; reach?: number; hold?: number } = {}): Slack[] {
  const near = o.near ?? 12, reach = o.reach ?? REACH, most = o.hold ?? HOLD;
  const all = jumps(frames), out: Slack[] = [];
  const play = start.copy();
  let at = 0;
  const advance = (to: number) => { for (; at < to; at++) play.step(frames[at]); };
  for (let k = 0; k < all.length; k++) {
    const jump = all[k], hold = jump.end - jump.start, prev = all[k - 1]?.end ?? 0, next = all[k + 1]?.start ?? frames.length;
    // Shifts that keep it clear of its neighbours (a frame apart, so they stay two jumps).
    const lo = Math.max(prev + 1, jump.start - reach), hi = Math.min(next - 1 - hold, jump.start + reach);
    advance(lo);
    const snap = play.copy();
    // Judged a couple of seconds after the jump at most, which keeps a long roll to the next one cheap.
    const goal = Math.min(next, jump.end + 120);
    const t: Trial = { snap, frames, from: lo, next, goal, jump, end: goal + Math.round((goal - lo) * 0.5) + 60 };
    // Where the route itself got to, and how low it went on the way.
    const route = attempt(t, jump.start, hold);
    const target = { x: route.x, y: route.low + near, count: route.count - 3, respawns: route.respawns, near };
    const ok = (from: number, h: number) => attempt(t, from, h, target);
    if (ok(jump.start, 0).reached) continue;
    let early = 0, late = 0, first = route.takeoff, last = route.takeoff;
    for (let r; jump.start - early - 1 >= lo && (r = ok(jump.start - early - 1, hold)).reached; early++) first = r.takeoff;
    for (let r; jump.start + late + 1 <= hi && (r = ok(jump.start + late + 1, hold)).reached; late++) last = r.takeoff;
    let minHold = hold, maxHold = hold;
    while (minHold > 1 && ok(jump.start, minHold - 1).reached) minHold--;
    while (maxHold < most && jump.start + maxHold + 1 < next && ok(jump.start, maxHold + 1).reached) maxHold++;
    out.push({ jump, x: Math.round(route.takeoff), y: Math.round(route.takeoffY), early, late, cells: Math.round(last - first), minHold, maxHold });
  }
  return out;
}

interface Trial { snap: Play; frames: Frame[]; from: number; next: number; goal: number; end: number; jump: Jump }
interface Target { x: number; y: number; count: number; respawns: number; near: number }

/**
 * Plays the route from `t.snap` with its jump moved to start at `at` and held for `hold` frames
 * (0: not at all), up to the next jump, then rolls on the way the route was going until `t.end`.
 * Says where he got to by `t.goal` (the next jump, or sooner), the lowest he went, where he took off, and whether
 * he ever got within reach of `target`.
 */
function attempt(t: Trial, at: number, hold: number, target?: Target) {
  const play = t.snap.copy(), { frames, jump } = t;
  let reached = false, low = -1e9, takeoff = 0, takeoffY = 0, x = 0, count = 0, respawns = 0;
  const roll = Math.sign(frames[t.next - 1].move);
  for (let i = t.from; i < t.end; i++) {
    if (i === at) (takeoff = play.bob.main?.cx ?? 0), (takeoffY = play.bob.main?.cy ?? 0);
    const inJump = i >= jump.start && i < jump.end, inNew = i >= at && i < at + hold;
    const fr = i >= t.next ? { ...frames[t.next - 1], move: roll, jump: false } : inJump || inNew ? { ...frames[i], jump: inNew } : frames[i];
    play.step(fr);
    const p = play.bob.main;
    if (i < t.goal) low = Math.max(low, p?.cy ?? 1e9);
    if (i === t.goal - 1) (x = p?.cx ?? -1e9), (count = play.bob.count), (respawns = play.respawns);
    if (target && p && play.respawns === target.respawns && p.cx >= target.x - target.near && p.cy <= target.y && play.bob.count >= target.count) {
      reached = true;
      break;
    }
    if (!target && i >= t.goal - 1) break;
  }
  return { reached, x, low, count, respawns, takeoff, takeoffY };
}
