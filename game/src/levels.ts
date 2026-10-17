// The levels a scenario can start in. For now the one level is Bob's test course; the
// level format (material PNGs plus entity JSON) adds the Green's levels beside it.
// No DOM, so a scenario runs in Node too.
import { COURSE_H, COURSE_W, buildCourse, sectionAt } from "@pixelbob/bob";
import { type Lamp, World } from "@pixelbob/sim";
import type { LevelId } from "./scenario.ts";

/** A level, built into a world. */
export interface Built {
  world: World;
  lamps: Lamp[];
  spawn: { x: number; y: number };
  /** Stranded bits of Bob to collect. */
  bits: { x: number; y: number; r: number }[];
  /** Get as much of Bob into this box as you can. */
  finish: { x0: number; y0: number; x1: number; y1: number };
  /** What the bit of the level at `x` is for, if anything. */
  note(x: number): string;
}

export interface Level {
  title: string;
  build(seed: number): Built;
}

export const LEVELS: Record<LevelId, Level> = {
  course: {
    title: "Bob's test course",
    build(seed) {
      const world = new World(COURSE_W, COURSE_H, seed);
      const course = buildCourse(world, seed);
      return {
        world,
        lamps: course.lamps,
        spawn: course.spawn,
        bits: course.bits,
        finish: course.finish,
        note(x) {
          const s = sectionAt(course, x);
          return s ? `${s.name}: ${s.note}` : "";
        },
      };
    },
  },
};
