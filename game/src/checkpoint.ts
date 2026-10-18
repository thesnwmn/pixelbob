// A checkpoint is a lantern on a post, standing on the ground under its point in level.json:
// Bob lights it by touching the post or the lantern (play.ts) and comes back standing beside it.
// Painted into the cell textures (`Shade`'s colour and glow) before Bob, so he passes in front
// of it. No DOM.
import { CAT, Cat, type Lamp, type World } from "@pixelbob/sim";

const STEM: [number, number, number] = [58, 47, 42];
const DARK: [number, number, number] = [92, 90, 84];
const LIT: [number, number, number] = [255, 240, 200];

/** The lantern's height, from the ground to its top. */
export const POST = 11;

/** The ground under a checkpoint, where its post stands: the first cell down that isn't open (water too), or 4 cells down if there's none near. */
export function ground(world: World, p: { x: number; y: number }): number {
  const x = Math.round(p.x), y = Math.max(0, Math.round(p.y));
  for (let gy = y; gy < Math.min(world.h, y + 24); gy++) {
    const c = CAT[world.mat[gy * world.w + x]];
    if (c !== Cat.Empty && c !== Cat.Gas) return gy;
  }
  return Math.min(world.h, y + 4);
}

/** Paints each checkpoint's lantern, lit or not, into the open cells under it. */
export function paintCheckpoints(world: World, color: Uint8Array, emit: Uint8Array, points: { x: number; y: number }[], lit: boolean[], frame: number): void {
  points.forEach((p, k) => {
    const x = Math.round(p.x), gy = ground(world, p);
    const on = lit[k];
    const flick = 0.85 + 0.15 * Math.sin(frame * 0.11 + k * 2.3);
    const put = (cx: number, cy: number, rgb: [number, number, number], glow: number) => {
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return;
      const i = cy * world.w + cx;
      const c = CAT[world.mat[i]];
      if (c !== Cat.Empty && c !== Cat.Gas) return;
      const o = i * 4;
      color[o] = rgb[0]; color[o + 1] = rgb[1]; color[o + 2] = rgb[2]; color[o + 3] = 255;
      emit[o] = rgb[0] * glow * 0.5; emit[o + 1] = rgb[1] * glow * 0.45; emit[o + 2] = rgb[2] * glow * 0.35;
      emit[o + 3] = 40;
    };
    // The post, then the lantern on top: a frame round a 1 × 2 light.
    for (let dy = 1; dy <= 7; dy++) put(x, gy - dy, STEM, 0);
    for (let dy = 8; dy <= POST; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const inside = dx === 0 && (dy === 9 || dy === 10);
        put(x + dx, gy - dy, inside ? (on ? LIT : DARK) : STEM, inside && on ? flick : 0);
      }
  });
}

/** The lit lanterns' light, as lamps on the level. */
export function lamps(world: World, points: { x: number; y: number }[], lit: boolean[]): Lamp[] {
  return points
    .filter((_, k) => lit[k])
    .map((p) => {
      const x = Math.round(p.x);
      return { x: x + 0.5, y: ground(world, p) - 9, color: [1, 0.9, 0.7], radius: 36 };
    });
}
