/**
 * Bob's tunable numbers. The playground shows a slider for each one; they are
 * his "normal" (room temperature) values. Temperature then scales them per
 * particle through `phase()` (see docs/bob.md).
 */
export interface Tweaks {
  /** 0..1: how hard he is to tear apart, and how readily torn-off bits rejoin. */
  cohesion: number;
  /** 0..1: how strongly he pulls back to his round shape. */
  memory: number;
  /** 0..1: how much his bonds give (wobble). */
  softness: number;
  /** 0..2: strength of the effort he puts into rolling and jumping. */
  muscle: number;
  /** 0..2: multiplies each material's friction. */
  grip: number;
  /** Top rolling speed on flat ground, px/s. */
  speed: number;
  /** Jump take-off speed at full charge, px/s. */
  jump: number;
  /** 0..1: how much he can steer while airborne or swimming. */
  air: number;
  /** 0..1: how much speed past his top speed hops can carry. A jump's lean forward fades from top speed to (1 + hop) times it, and a landing keeps this fraction of the speed past top speed: at 1, chained hops stack speed freely; lower, they can't build up. */
  hop: number;
  /** "roll": he turns like a tread and friction carries him. "crawl": he pushes the ground with his underside. */
  drive: "roll" | "crawl";
  /** Radius in particles at spawn. */
  size: number;
  /** Gravity, px/s². */
  gravity: number;
  /** 0..2: how fast he takes on the heat or cold of a strong source nearby. */
  soak: number;
  /** 0..1: runny, how stringy he is: 0 drips like water, 1 strings out like honey. */
  stringy: number;
  /** 0.2..3: how long he holds a heat or chill once away from sources (higher = longer). */
  hold: number;
}

export const DEFAULTS: Tweaks = {
  cohesion: 0.6,
  memory: 0.3,
  softness: 0.45,
  muscle: 1,
  grip: 1,
  speed: 70,
  jump: 190,
  air: 0.35,
  hop: 0.25,
  drive: "roll",
  size: 9,
  gravity: 420,
  soak: 1,
  hold: 1,
  stringy: 0.6,
};

/** Slider ranges for the playground panel. */
export const RANGES: Record<Exclude<keyof Tweaks, "drive">, [number, number, number]> = {
  cohesion: [0, 1, 0.01],
  memory: [0, 1, 0.01],
  softness: [0, 1, 0.01],
  muscle: [0, 2, 0.05],
  grip: [0, 2, 0.05],
  speed: [10, 200, 5],
  jump: [0, 400, 10],
  air: [0, 1, 0.05],
  hop: [0, 1, 0.05],
  size: [3, 14, 1],
  gravity: [100, 900, 20],
  soak: [0, 2, 0.05],
  hold: [0.2, 3, 0.1],
  stringy: [0, 1, 0.05],
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How much of a jump's lean forward (0..1) he gets at speed `v` (px/s, + the way he's going):
 * all of it up to his top speed, then less and less, none at (1 + hop) times top speed. A
 * fade, never a cut, so chained hops can't stack speed without limit.
 */
export const hopLean = (v: number, tw: Pick<Tweaks, "speed" | "hop">) => clamp01(1 - (v - tw.speed) / (tw.speed * Math.max(0.05, tw.hop)));

/** How frozen (0..1) and how runny (0..1) a particle is at temperature t (°C). */
export const frozenness = (t: number) => clamp01((2 - t) / 10);
export const runniness = (t: number) => clamp01((t - 35) / 25);

/**
 * What temperature does to Bob. Movement is something he does by deforming
 * himself, so anything that stops him deforming (freezing) or stops him
 * holding a shape (melting) takes his abilities away:
 *   - muscle: frozen solid he can't push at all; cold is sluggish; hot is weak.
 *   - memory/stiffness: frozen is rigid, hot barely keeps a shape.
 *   - breaking: frozen bonds snap at a small stretch (brittle), hot ones stretch
 *     like taffy instead.
 */
export function muscleAt(t: number): number {
  if (t <= -8) return 0;
  if (t < 8) return (t + 8) / 16;
  if (t <= 45) return 1;
  return Math.max(0.4, 1 - (t - 45) / 100);
}
