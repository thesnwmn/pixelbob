// A generic deep copy of the play state (the world and Bob), so a search can branch from
// a point in a run instead of replaying it from the start. Spike code: the question is
// whether copying every own field restores the run exactly.
import type { Play } from "../../../game/src/play.ts";

type Any = Record<string, unknown>;

function clone(v: unknown, memo: Map<unknown, unknown>): unknown {
  if (v === null || typeof v !== "object") return v;
  if (memo.has(v)) return memo.get(v);
  if (ArrayBuffer.isView(v)) {
    const c = (v as unknown as { slice(): unknown }).slice();
    memo.set(v, c);
    return c;
  }
  if (Array.isArray(v)) {
    const c: unknown[] = [];
    memo.set(v, c);
    for (const x of v) c.push(clone(x, memo));
    return c;
  }
  if (v instanceof Map || v instanceof Set) throw new Error("snapshot: a Map or Set in the state");
  const c = Object.create(Object.getPrototypeOf(v)) as Any;
  memo.set(v, c);
  for (const k of Object.keys(v)) c[k] = clone((v as Any)[k], memo);
  return c;
}

export interface Snapshot {
  state: [unknown, unknown];
  frame: number;
  finishedAt: number;
}

export function snapshot(play: Play): Snapshot {
  return { state: clone([play.level.world, play.bob], new Map()) as [unknown, unknown], frame: play.frame, finishedAt: play.finishedAt };
}

/** Puts `play` back to the snapshot (which stays reusable). The recorder is not restored: the search keeps its own inputs. */
export function restore(play: Play, s: Snapshot): void {
  const [world, bob] = clone(s.state, new Map()) as [Play["level"]["world"], Play["bob"]];
  play.level.world = world;
  play.bob = bob;
  play.frame = s.frame;
  play.finishedAt = s.finishedAt;
}
