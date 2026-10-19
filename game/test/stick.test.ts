import { describe, expect, it } from "vitest";
import { STICK_DEAD, STICK_FULL, STICK_MOVE, readStick } from "../src/stick.ts";

describe("the touch stick", () => {
  it("reads a sideways drag that drifts down as a roll, with no down (#37)", () => {
    // The playtest's opening drag: full right, the thumb 19 to 26 px below where it started, which read as down 1/8 to 3/8.
    for (const dx of [40, 60, 100]) for (const dy of [19, 22, 26, 30]) {
      expect(readStick(dx, dy), `${dx}, ${dy}`).toEqual({ move: 1, down: 0, up: 0 });
      expect(readStick(-dx, -dy), `${-dx}, ${-dy}`).toEqual({ move: -1, down: 0, up: 0 });
    }
  });

  it("reads straight down and up as before", () => {
    expect(readStick(0, STICK_DEAD)).toEqual({ move: 0, down: 0, up: 0 });
    expect(readStick(0, STICK_DEAD + STICK_FULL)).toEqual({ move: 0, down: 1, up: 0 });
    expect(readStick(0, -(STICK_DEAD + STICK_FULL / 2))).toEqual({ move: 0, down: 0, up: 0.5 });
    expect(readStick(STICK_MOVE / 2, 0).move).toBe(0.5);
  });

  it("still squashes on a steep diagonal, so he can squash while rolling", () => {
    const s = readStick(40, 90);
    expect(s.move).toBe(1);
    expect(s.down).toBeGreaterThan(0.9);
  });

  it("changes smoothly as the thumb moves: no switch", () => {
    // One pixel of drag in any direction moves no reading by more than a pixel's worth.
    const step = 1 / Math.min(STICK_MOVE, STICK_FULL) + 1e-9;
    for (let dx = -80; dx <= 80; dx += 3) for (let dy = -80; dy <= 80; dy += 3) {
      const a = { ...readStick(dx, dy) };
      for (const [ex, ey] of [[1, 0], [0, 1]]) {
        const b = readStick(dx + ex, dy + ey);
        for (const k of ["move", "down", "up"] as const) expect(Math.abs(b[k] - a[k]), `${dx}, ${dy}, ${k}`).toBeLessThanOrEqual(step * 1.75);
      }
    }
  });
});
