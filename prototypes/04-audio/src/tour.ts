// A scripted tour of the course: what each part of it sounds like, as cues frame by frame.
// render.ts plays these through the synth offline, to a WAV file.
import { COURSE_H, COURSE_W, DEFAULTS, buildCourse, createBob } from "@pixelbob/bob";
import { CAT, Cat, World } from "@pixelbob/sim";
import { type Cues, Listener } from "./listen.ts";

/** Where to start, for how long, and what to press each frame (f counts from the start). */
export interface Leg { name: string; at: number; frames: number; input: (f: number) => { move: number; jump: boolean; down?: number } }

export const TOUR: Leg[] = [
  { name: "rolling over the flat and the hills, a tap jump, then a full charge", at: 280, frames: 420, input: (f) => ({ move: 1, jump: (f > 120 && f < 124) || (f > 260 && f < 284) }) },
  { name: "the steps, then rolling into the water gap and paddling out", at: 760, frames: 330, input: (f) => ({ move: f < 200 ? 1 : 0.5, jump: f > 200 && f < 280 }) },
  { name: "sliding on the ice", at: 930, frames: 180, input: () => ({ move: 1, jump: false }) },
  { name: "jumping onto the spikes", at: 1215, frames: 180, input: (f) => ({ move: 1, jump: f > 10 && f < 18 }) },
  { name: "rolling into the lava", at: 1335, frames: 200, input: () => ({ move: 1, jump: false }) },
  { name: "off the cliff into the pool", at: 1560, frames: 240, input: () => ({ move: 1, jump: false }) },
];

/** Plays the tour headless and returns each frame's cues, with where each leg starts. */
export function tour(): { cues: Cues[]; legs: { name: string; frame: number }[] } {
  const cues: Cues[] = [], legs: { name: string; frame: number }[] = [];
  const ear = new Listener();
  for (const leg of TOUR) {
    const world = new World(COURSE_W, COURSE_H, 7);
    const course = buildCourse(world, 7);
    const bob = createBob({ ...DEFAULTS }, 7);
    let top = COURSE_H - 1;
    while (top > 0 && CAT[world.mat[(top - 1) * COURSE_W + leg.at]] !== Cat.Empty && CAT[world.mat[(top - 1) * COURSE_W + leg.at]] !== Cat.Gas) top--;
    bob.spawn(world, leg.at, top - DEFAULTS.size - 3, 20, course.bits);
    // Let him settle silently, then listen.
    for (let i = 0; i < 30; i++) { world.step(); bob.step(world, { move: 0, jump: false }); }
    ear.reset(bob);
    legs.push({ name: leg.name, frame: cues.length });
    for (let f = 0; f < leg.frames; f++) {
      world.step();
      bob.step(world, leg.input(f));
      cues.push({ ...ear.hear(bob, world) });
    }
  }
  return { cues, legs };
}
