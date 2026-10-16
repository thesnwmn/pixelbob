import { Buf, Kind } from "./buf.ts";
import type { RGB } from "./color.ts";

/**
 * Lighting for stills. Everything is computed on a half-resolution occlusion
 * grid: shadows come out soft, and it is cheap enough to rebuild in a frame.
 * The game version will do the same thing in a shader (see docs/04).
 */

export interface PointLight {
  x: number;
  y: number;
  color: RGB;
  radius: number;
  intensity: number;
  /** 0 = steady, 1 = flickers like a flame. */
  flicker?: number;
  seed?: number;
}

export interface DirLight {
  /** Direction towards the light, degrees from straight up (positive = towards the right). */
  angles: number[];
  color: RGB;
}

/** Half-resolution light grid shared by all lights in a scene. */
export class LightGrid {
  readonly w: number;
  readonly h: number;
  readonly occ: Float32Array;

  constructor(buf: Buf) {
    this.w = Math.ceil(buf.w / 2);
    this.h = Math.ceil(buf.h / 2);
    this.occ = new Float32Array(this.w * this.h);
    for (let y = 0; y < buf.h; y++)
      for (let x = 0; x < buf.w; x++) {
        const i = (y >> 1) * this.w + (x >> 1);
        // Average of the 2x2 block, so thin features still cast some shadow.
        this.occ[i] += buf.occ[y * buf.w + x] * 0.25;
      }
    // Half-res cells see two pixels' worth of material per step.
    for (let i = 0; i < this.occ.length; i++) this.occ[i] = 1 - (1 - Math.min(1, this.occ[i])) ** 2;
  }

  /** Transmittance map for one point light (unit intensity, falloff applied). */
  point(l: PointLight): { map: Float32Array; x0: number; y0: number; x1: number; y1: number } {
    const { w, h, occ } = this;
    const map = new Float32Array(w * h);
    const lx = l.x / 2, ly = l.y / 2, r = l.radius / 2;
    const x0 = Math.max(0, Math.floor(lx - r)), x1 = Math.min(w - 1, Math.ceil(lx + r));
    const y0 = Math.max(0, Math.floor(ly - r)), y1 = Math.min(h - 1, Math.ceil(ly + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = lx - x, dy = ly - y;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const fall = (1 - d / r) ** 1.6;
        let t = 1;
        const steps = Math.ceil(d);
        // Skip the cells right at the light so emitters don't shadow themselves.
        for (let s = 1; s < steps - 1 && t > 0.01; s++) {
          const k = s / steps;
          t *= 1 - occ[Math.round(y + dy * k) * w + Math.round(x + dx * k)];
        }
        map[y * w + x] = t * fall;
      }
    return { map, x0, y0, x1, y1 };
  }

  /** Light from far away (sky, sun): average transmittance along rays to the buffer edge. */
  directional(angles: number[]): Float32Array {
    const { w, h, occ } = this;
    const map = new Float32Array(w * h);
    const dirs = angles.map((a) => [Math.sin((a * Math.PI) / 180), -Math.cos((a * Math.PI) / 180)] as const);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (const [dx, dy] of dirs) {
          let t = 1, px = x, py = y;
          while (t > 0.01) {
            px += dx; py += dy;
            const ix = Math.round(px), iy = Math.round(py);
            if (iy < 0 || ix < 0 || ix >= w) break;
            if (iy >= h) { t = 0; break; }
            t *= 1 - occ[iy * w + ix];
          }
          sum += t > 0.01 ? t : 0;
        }
        map[y * w + x] = sum / dirs.length;
      }
    return map;
  }
}

/**
 * Chamfer distance (in pixels) from each solid pixel to the nearest non-solid
 * pixel, plus the index of that pixel. Solids are lit with the light found at
 * their nearest surface, then faded by depth: surfaces glow, interiors go dark.
 */
export function depthMap(buf: Buf): { d: Float32Array; near: Int32Array } {
  const { w, h, kind } = buf;
  const d = new Float32Array(w * h);
  const near = new Int32Array(w * h);
  const INF = 1e6;
  for (let i = 0; i < d.length; i++) { d[i] = kind[i] === Kind.Solid ? INF : 0; near[i] = i; }
  const relax = (i: number, x: number, y: number, cost: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const j = y * w + x;
    if (d[j] + cost < d[i]) { d[i] = d[j] + cost; near[i] = near[j]; }
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      relax(i, x - 1, y, 1); relax(i, x, y - 1, 1); relax(i, x - 1, y - 1, 1.414); relax(i, x + 1, y - 1, 1.414);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      relax(i, x + 1, y, 1); relax(i, x, y + 1, 1); relax(i, x + 1, y + 1, 1.414); relax(i, x - 1, y + 1, 1.414);
    }
  // A buffer that is all solid has no surface: treat as deep.
  for (let i = 0; i < d.length; i++) if (d[i] >= INF) d[i] = 999;
  return { d, near };
}
