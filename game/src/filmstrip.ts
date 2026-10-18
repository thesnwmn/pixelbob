// Filmstrips: key frames of a run side by side, each a crop of the level around Bob, so an
// agent (or a PR) can see a run without playing it. Drawn from the same cell colours and
// Bob's painter as the game, but unlit: the lighting is the GPU's. No DOM, so it runs in
// Node; game/scripts/filmstrip.ts writes it to a PNG.
import { BobPainter } from "@pixelbob/bob";
import { Shade } from "@pixelbob/render";
import { Play, runReplay } from "./play.ts";
import type { Replay } from "./replay.ts";
import type { Scenario } from "./scenario.ts";

export interface Strip {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** The frame each shot is of. */
  frames: number[];
}

export interface StripOptions {
  /** How many shots, evenly through the run; the last is its end. */
  shots?: number;
  /** Each shot's size in cells. */
  cw?: number;
  ch?: number;
  /** Pixels per cell. */
  scale?: number;
}

const GAP = 2;

/** Plays `replay` and draws `shots` key frames of it in a row. */
export function filmstrip(scenario: Scenario, replay: Replay, opts: StripOptions = {}): Strip {
  const n = replay.frames.length;
  if (!n) throw new Error("the replay has no frames");
  const whole = (v: number | undefined, d: number) => (Number.isFinite(v) && v! >= 1 ? Math.floor(v!) : d);
  const shots = whole(opts.shots, 6), scale = whole(opts.scale, 2);
  const size = new Play(scenario).level.world;
  const cw = Math.min(size.w, whole(opts.cw, 160)), ch = Math.min(size.h, whole(opts.ch, 96));
  const frames = [...new Set(Array.from({ length: shots }, (_, i) => Math.max(1, Math.round(((i + 1) * n) / shots))))];
  const sw = cw * scale, sh = ch * scale;
  const w = frames.length * sw + (frames.length - 1) * GAP, h = sh;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const painter = new BobPainter();
  let shade: Shade | undefined;
  let at = { x: 0, y: 0 };
  const shoot = (play: Play, k: number) => {
    const { world } = play.level;
    shade ??= new Shade(world, scenario.seed);
    shade.update(play.frame);
    painter.draw(play.bob.view(), world, shade.color, shade.emit, play.frame);
    const x0 = Math.max(0, Math.min(world.w - cw, Math.round(at.x - cw / 2)));
    const y0 = Math.max(0, Math.min(world.h - ch, Math.round(at.y - ch / 2)));
    const { color, emit } = shade;
    for (let py = 0; py < sh; py++)
      for (let px = 0; px < sw; px++) {
        const cx = x0 + Math.floor(px / scale), cy = y0 + Math.floor(py / scale);
        const i = (cy * world.w + cx) * 4, o = (py * w + k * (sw + GAP) + px) * 4;
        // Emission is stored halved: add it back, so heat and glow still show.
        rgba[o] = color[i] + emit[i] * 2;
        rgba[o + 1] = color[i + 1] + emit[i + 1] * 2;
        rgba[o + 2] = color[i + 2] + emit[i + 2] * 2;
        rgba[o + 3] = 255;
      }
  };
  runReplay(scenario, replay, (play) => {
    const p = play.bob.main;
    if (p) at = { x: p.cx, y: p.cy };
    const k = frames.indexOf(play.frame);
    if (k >= 0) shoot(play, k);
  });
  return { w, h, rgba, frames };
}
