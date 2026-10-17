import type { World } from "@pixelbob/sim";
import type { Tweaks } from "./tweaks.ts";

/**
 * What the player is asking for this step. move is -1..1; down and up (0..1, optional) press
 * down and up (down squashes or pours him; on a tacky wall he's pushing into, up and down
 * climb him up and down it).
 */
export interface Input { move: number; jump: boolean; down?: number; up?: number }

/** A connected bit of Bob. pieces[0] is always the biggest: the one with the eyes. */
export interface Piece {
  /** Members are order[start .. start + len) (of his view, for drawing and counting). */
  start: number;
  len: number;
  cx: number; cy: number;
  vx: number; vy: number;
  temp: number;
  /** Radius of the disc with the same spread. */
  radius: number;
  /** Particles touching ground below them this step. */
  ground: number;
  /** Average contact normal (points away from the surfaces he touches). */
  nx: number; ny: number;
  /** Fraction of members in a liquid. */
  wet: number;
}

export type Losses = { boiled: number; dissolved: number; crushed: number; fell: number };

/**
 * What the playground, the painter and the tests need from Bob. Everything is measured in
 * "particles": one per pixel of him.
 */
export interface BobModel {
  tweaks: Tweaks;
  /** Fixed temperature for all of him, or null to exchange heat with the world. */
  fixedTemp: number | null;
  facing: number;
  /** pieces[0] is the main piece, with the eyes. */
  pieces: Piece[];
  readonly main: Piece | undefined;
  /** Particles alive, and how many he started with (stranded bits included). */
  count: number;
  total: number;
  losses: Losses;
  spawn(world: World, cx: number, cy: number, temp?: number, bits?: { x: number; y: number; r: number }[]): void;
  step(world: World, input: Input): void;
  /** Particles inside a rectangle (for "how much of Bob reached the goal"). */
  countIn(x0: number, y0: number, x1: number, y1: number): number;
  /** Points to draw, one per pixel of him, grouped by piece (pieces[k].start/len index `order`). */
  view(): BobView;
  /** Move all of him (tests drop him from a height). */
  shift(dx: number, dy: number): void;
}

export interface BobView {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  t: Float32Array;
  order: Int32Array;
  pieces: Piece[];
  fixedTemp: number | null;
  facing: number;
}

