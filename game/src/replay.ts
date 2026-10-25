// Replays: the input of a run, frame by frame. The sim and Bob are deterministic, so a
// scenario plus its replay reproduces the run exactly, which makes a replay a test case.
// The feedback button attaches one, and game/replays/ keeps them with their outcome for
// the health check (`code/replays`). See studio/README.md#automated-playtesting.
//
// No imports, so the format can be read anywhere (like scenario.ts).
//
// The text form, run-length encoded, wraps anywhere between runs:
//   pixelbob-replay v1 <scenario> <frames>: <run> <run> …
// A run is `<move>[j][b][d<down>][u<up>][*<count>]`, each axis in eighths: `8*120` is full
// right for 120 frames, `8j` right with jump held, `0d8*30` crouching still for 30, `0b`
// back to the last checkpoint (R).

/** One frame's input, in eighths: what the game feeds Bob, so a replay matches the run exactly. */
export interface Frame {
  move: number;
  jump: boolean;
  /** Back to the last checkpoint (R), this frame. */
  back: boolean;
  down: number;
  up: number;
}

/** What a run came to, for comparing replays: the frames it ran, when it finished, how much of Bob got home. */
export interface Outcome {
  frames: number;
  /** The frame the main piece reached the finish, or 0. */
  finished: number;
  /** % of Bob in the finish box at the end. */
  home: number;
  /** % of Bob still together in pieces at the end (not stranded or lost). */
  bob: number;
  /** A fingerprint of where every bit of Bob and every cell ended up, so any change to the run shows. */
  state: string;
}

export interface Replay {
  scenario: string;
  frames: Frame[];
}

const EIGHTHS = 8;
const eighths = (v: number | undefined, lo: number) => Math.max(lo * EIGHTHS, Math.min(EIGHTHS, Math.round((Number.isFinite(v) ? v! : 0) * EIGHTHS))) / EIGHTHS + 0; // + 0: never -0, which the replay would read back as 0; NaN is 0

/** Input rounded to eighths: the game steps with this, so what's recorded is exactly what ran. */
export function quantize(input: { move: number; jump: boolean; back?: boolean; down?: number; up?: number }): Frame {
  return { move: eighths(input.move, -1), jump: !!input.jump, back: !!input.back, down: eighths(input.down, 0), up: eighths(input.up, 0) };
}

const token = (f: Frame) =>
  `${Math.round(f.move * EIGHTHS)}${f.jump ? "j" : ""}${f.back ? "b" : ""}${f.down ? `d${Math.round(f.down * EIGHTHS)}` : ""}${f.up ? `u${Math.round(f.up * EIGHTHS)}` : ""}`;

/** Records frames as runs, so an hour of play stays small. */
export class Recorder {
  private runs: { token: string; count: number }[] = [];
  frames = 0;

  push(f: Frame): void {
    const t = token(f), last = this.runs[this.runs.length - 1];
    if (last && last.token === t) last.count++;
    else this.runs.push({ token: t, count: 1 });
    this.frames++;
  }

  copy(): Recorder {
    const r = new Recorder();
    r.runs = this.runs.map((x) => ({ ...x }));
    r.frames = this.frames;
    return r;
  }

  clear(): void {
    this.runs = [];
    this.frames = 0;
  }

  /** The replay as text, wrapped at about `width` characters. */
  text(scenario: string, width = 100): string {
    const lines = [`pixelbob-replay v1 ${scenario} ${this.frames}:`];
    for (const r of this.runs) {
      const run = r.count > 1 ? `${r.token}*${r.count}` : r.token;
      if (lines[lines.length - 1].length + run.length + 1 > width) lines.push(run);
      else lines[lines.length - 1] += ` ${run}`;
    }
    return lines.join("\n");
  }
}

/** Records `frames` and returns the text: for tests and bots. */
export function encode(scenario: string, frames: Frame[], width?: number): string {
  const r = new Recorder();
  for (const f of frames) r.push(f);
  return r.text(scenario, width);
}

/** Two hours at 60 Hz: longer than any run worth keeping, and a bound on what a replay can make us allocate. */
export const MAX_FRAMES = 2 * 60 * 60 * 60;

const HEAD = /^pixelbob-replay v1 ([a-z0-9]+(?:-[a-z0-9]+)*) (\d+):$/;
const RUN = /^(-?\d)(j)?(b)?(?:d(\d))?(?:u(\d))?(?:\*(\d+))?$/;

/** Reads a replay's text; returns it, or what's wrong with it. */
export function decode(text: string): { replay?: Replay; errors: string[] } {
  const words = text.trim().split(/\s+/);
  const head = HEAD.exec(words.slice(0, 4).join(" "));
  if (!head) return { errors: ['replay: starts "pixelbob-replay v1 <scenario> <frames>:"'] };
  const total = Number(head[2]);
  if (total > MAX_FRAMES) return { errors: [`replay: ${total} frames is more than ${MAX_FRAMES} (two hours)`] };
  const frames: Frame[] = [];
  const axis = (s: string | undefined) => Number(s ?? 0) / EIGHTHS;
  for (const w of words.slice(4)) {
    const m = RUN.exec(w);
    const n = m ? Number(m[6] ?? 1) : 0;
    if (!m || n < 1 || Math.abs(Number(m[1])) > EIGHTHS || Number(m[4] ?? 0) > EIGHTHS || Number(m[5] ?? 0) > EIGHTHS)
      return { errors: [`replay: "${w}" isn't a run (<move>[j][b][d<down>][u<up>][*<count>], in eighths)`] };
    const f: Frame = { move: axis(m[1]), jump: m[2] === "j", back: m[3] === "b", down: axis(m[4]), up: axis(m[5]) };
    if (frames.length + n > total) return { errors: [`replay: says ${total} frames but has more`] };
    for (let i = 0; i < n; i++) frames.push(f);
  }
  if (frames.length !== total) return { errors: [`replay: says ${total} frames but has ${frames.length}`] };
  return { replay: { scenario: head[1], frames }, errors: [] };
}

/** The replay in a pasted feedback report (or any text holding one), or the empty string. The last one, since the report ends with it and the notes before it may mention one. */
export function findReplay(text: string): string {
  const at = text.lastIndexOf("pixelbob-replay v1 ");
  if (at < 0) return "";
  const end = text.indexOf("```", at);
  return text.slice(at, end < 0 ? undefined : end).trim();
}

/** A kept replay, `game/replays/<id>.json`: the run and the outcome it should come to. */
export interface ReplayFile {
  id: string;
  /** The day it was recorded, YYYY-MM-DD. */
  recorded: string;
  /** Why it's kept: what it plays through, or the bug it reproduces. */
  note: string;
  replay: Replay;
  expect: Outcome;
}

const OUTCOME_KEYS = ["frames", "finished", "home", "bob", "state"] as const;

/** Checks a replay file's contents; returns it, or what's wrong with it. */
export function parseReplayFile(id: string, raw: unknown): { file?: ReplayFile; errors: string[] } {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`the id "${id}" (the file name) isn't kebab-case`);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { errors: [...errors, "not a JSON object"] };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["recorded", "note", "replay", "expect"].includes(k)) errors.push(`${k}: not a field (recorded, note, replay, expect)`);
  if (typeof o.recorded !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.recorded)) errors.push("recorded: the day it was recorded, YYYY-MM-DD");
  if (typeof o.note !== "string" || !o.note.trim()) errors.push("note: a non-empty string, saying why it's kept");
  let replay: Replay | undefined;
  if (typeof o.replay !== "string") errors.push("replay: the replay's text, as the feedback report has it");
  else {
    const d = decode(o.replay);
    replay = d.replay;
    errors.push(...d.errors);
  }
  const e = o.expect;
  if (typeof e !== "object" || e === null || Array.isArray(e)) errors.push(`expect: an object (${OUTCOME_KEYS.join(", ")})`);
  else {
    const ex = e as Record<string, unknown>;
    for (const k of Object.keys(ex)) if (!(OUTCOME_KEYS as readonly string[]).includes(k)) errors.push(`expect.${k}: not a field (${OUTCOME_KEYS.join(", ")})`);
    for (const k of OUTCOME_KEYS)
      if (k === "state") {
        if (typeof ex.state !== "string" || !/^[0-9a-f]{8}$/.test(ex.state)) errors.push("expect.state: the run's fingerprint, 8 hex digits");
      } else if (!Number.isInteger(ex[k]) || (ex[k] as number) < 0) errors.push(`expect.${k}: a whole number, 0 or more`);
  }
  if (errors.length) return { errors };
  const ex = e as Outcome;
  return { file: { id, recorded: o.recorded as string, note: o.note as string, replay: replay!, expect: { frames: ex.frames, finished: ex.finished, home: ex.home, bob: ex.bob, state: ex.state } }, errors };
}
