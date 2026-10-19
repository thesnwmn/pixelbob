/**
 * The touch stick: a drag on the left half, from where the thumb went down, read as move, down and up.
 * No DOM, so the tests can feed it drags.
 */

export interface Stick { move: number; down: number; up: number }

/** Pixels of drag for full move. */
export const STICK_MOVE = 40;
/** Pixels straight down (or up) before down (or up) starts, and how many more until it's full. */
export const STICK_DEAD = 15, STICK_FULL = 30;
/**
 * How much sideways drag pushes the start of down and up further away: per pixel sideways, this many
 * pixels more. So a drag counts as down only when it's steeper than about 37° (atan 0.75) below level,
 * and a thumb drifting down while it rolls him stays a roll. It grows smoothly from there, never a switch.
 */
export const STICK_SLANT = 0.75;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Reads a drag of (dx, dy) pixels, screen y down, into a stick. */
export function readStick(dx: number, dy: number, out: Stick = { move: 0, down: 0, up: 0 }): Stick {
  const dead = STICK_DEAD + STICK_SLANT * Math.abs(dx);
  out.move = clamp(dx / STICK_MOVE, -1, 1);
  out.down = clamp((dy - dead) / STICK_FULL, 0, 1);
  out.up = clamp((-dy - dead) / STICK_FULL, 0, 1);
  return out;
}
