import { BOB_COLORS, DEFAULTS, createBob, paintBob, type BobColors, type BobModel, type BobView, type Input, type Tweaks } from "@pixelbob/bob";
import { M, World } from "@pixelbob/sim";
import { Buf, Kind } from "./buf.ts";

/**
 * The real Bob in the stills. A still is painted, not simulated, but Bob is goo
 * (docs/08-bob.md) and his shapes only look right when they come from the goo: so a
 * scene builds a throwaway sim world from its own pixels, drops the actual Bob into
 * it, plays him a few seconds of input, and paints the particles where they ended up.
 * Deterministic, like everything else here.
 */

export const PALETTES: Record<string, BobColors & { name: string }> = BOB_COLORS;
export type BobPalette = BobColors;

export interface Pose {
  /** Where he spawns (his centre). */
  x: number;
  y: number;
  /** His temperature, °C, held fixed (20 normal; above 35 runny, 60 fully; below 2 cold, -8 frozen). */
  temp?: number;
  tweaks?: Partial<Tweaks>;
  /** How many 1/60 s steps to play him. */
  frames?: number;
  /** What the player does on each step (his coordinates are relative to `region`, if set). */
  input?: (frame: number, bob: BobModel) => Input;
  /** Bits of him lying elsewhere (lost bits), as discs. */
  bits?: { x: number; y: number; r: number }[];
  /**
   * What he meets at each pixel, as a sim material. Default: rock for the scene's solid
   * pixels, air elsewhere. Scenes override it for tacky walls, ice, spikes or water.
   */
  mat?: (x: number, y: number, kind: number) => number;
  /** Change him mid-pose (a temperature ramp, a nudge). */
  each?: (frame: number, bob: BobModel) => void;
  /** Only simulate this part of the scene, [x, y, w, h] (default: all of it). */
  region?: [number, number, number, number];
  seed?: number;
}

/** Plays Bob through a pose and returns a copy of where his particles ended up. */
export function poseBob(buf: Buf, pose: Pose): BobView {
  const frames = pose.frames ?? 120;
  return poseFrames(buf, pose, [frames])[0];
}

/** Like poseBob, but snapshots him after each of the given numbers of steps (in order). */
export function poseFrames(buf: Buf, pose: Pose, at: number[]): BobView[] {
  const [rx, ry, rw, rh] = pose.region ?? [0, 0, buf.w, buf.h];
  const world = new World(rw, rh, pose.seed ?? 1);
  const mat = pose.mat ?? ((_x: number, _y: number, k: number) => (k === Kind.Solid ? M.rock : M.air));
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) world.mat[y * rw + x] = mat(x + rx, y + ry, buf.kindAt(x + rx, y + ry));
  const bob = createBob({ ...DEFAULTS, ...pose.tweaks }, pose.seed ?? 1);
  bob.spawn(world, pose.x - rx, pose.y - ry, pose.temp ?? 20, (pose.bits ?? []).map((b) => ({ ...b, x: b.x - rx, y: b.y - ry })));
  bob.fixedTemp = pose.temp ?? 20;
  const out: BobView[] = [];
  const snap = () => {
    const v = bob.view();
    out.push(movePose({
      x: v.x.slice(), y: v.y.slice(), vx: v.vx.slice(), vy: v.vy.slice(), t: v.t.slice(), order: v.order.slice(),
      pieces: v.pieces.map((p) => ({ ...p })), fixedTemp: v.fixedTemp, facing: v.facing,
    }, rx, ry));
  };
  let f = 0;
  for (const end of at) {
    for (; f < end; f++) {
      pose.each?.(f, bob);
      bob.step(world, pose.input?.(f, bob) ?? { move: 0, jump: false });
    }
    snap();
  }
  return out;
}

export interface GooOpts {
  palette: BobPalette;
  /** Time, for the fizz of his edge and blinking. */
  t?: number;
  /** Multiplies his self-light (a readability choice: more in very dark or very tinted scenes). */
  selfLit?: number;
  /** Override the temperature he's drawn at (e.g. to show a bit as hot while posed at 20). */
  temp?: number;
}

/** Paints a posed Bob into the scene, exactly as the game draws him. */
export function drawGoo(buf: Buf, view: BobView, o: GooOpts): void {
  const k = o.selfLit ?? 1;
  const v = o.temp === undefined ? view : { ...view, fixedTemp: o.temp };
  paintBob(v, (x, y) => buf.solidAt(x, y), (x, y, c, al, glow) => {
    const rgb: [number, number, number] = [c[0] / 255, c[1] / 255, c[2] / 255];
    buf.blend(x, y, rgb, al, Kind.Object, 0.2);
    if (glow) buf.glow(x, y, rgb, glow * k);
  }, Math.floor((o.t ?? 0) * 60), o.palette);
}

/** A copy of a pose moved by (dx, dy): for reusing one shape in a sheet. */
export function movePose(v: BobView, dx: number, dy: number): BobView {
  const x = v.x.slice(), y = v.y.slice();
  for (let i = 0; i < x.length; i++) { x[i] += dx; y[i] += dy; }
  return { ...v, x, y, pieces: v.pieces.map((p) => ({ ...p, cx: p.cx + dx, cy: p.cy + dy })) };
}
