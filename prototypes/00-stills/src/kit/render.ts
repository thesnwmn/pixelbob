import { Buf, Kind } from "./buf.ts";
import { hex, type RGB } from "./color.ts";
import { LightGrid, depthMap, type DirLight, type PointLight } from "./light.ts";
import { noise2 } from "./rng.ts";

/** Everything a scene hands to the renderer. */
export interface Setup {
  buf: Buf;
  lights: PointLight[];
  dirs?: DirLight[];
  ambient: RGB;
  /** Solids darken from their surface over `fade` pixels down to `min` brightness. */
  depth?: { fade: number; min: number };
  /** How strongly the back wall picks up light (it sits behind the play layer). */
  backLit?: number;
  grade?: Partial<Grade>;
  /** Draws everything that moves: called each frame on a fresh copy of `buf`. */
  frame?: (buf: Buf, t: number) => void;
}

export interface Grade {
  tint: RGB;
  lift: RGB;
  vignette: number;
  bloom: number;
  threshold: number;
  exposure: number;
}

export type View = "final" | "flat" | "light" | "nobloom";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) / 255);

export class Renderer {
  readonly w: number;
  readonly h: number;
  private readonly hw: number;
  private readonly hh: number;
  private readonly work: Buf;
  private readonly maps: { l: PointLight; map: Float32Array; x0: number; y0: number; x1: number; y1: number }[];
  private readonly base: Float32Array; // half-res RGB: ambient + directional lights
  private readonly depthF: Float32Array;
  private readonly near: Int32Array;
  private deepMin = 0;
  private readonly light: Float32Array; // half-res RGB, per frame
  private readonly lightFull: Float32Array;
  private readonly col: Float32Array;
  private readonly grade: Grade;
  private readonly s: Setup;

  constructor(s: Setup) {
    this.s = s;
    const { buf } = s;
    this.w = buf.w; this.h = buf.h;
    const grid = new LightGrid(buf);
    this.hw = grid.w; this.hh = grid.h;
    this.work = buf.clone();
    this.maps = s.lights.map((l) => ({ l, ...grid.point(l) }));
    this.base = new Float32Array(this.hw * this.hh * 3);
    for (let i = 0; i < this.hw * this.hh; i++) {
      this.base[i * 3] = s.ambient[0]; this.base[i * 3 + 1] = s.ambient[1]; this.base[i * 3 + 2] = s.ambient[2];
    }
    for (const d of s.dirs ?? []) {
      const m = grid.directional(d.angles);
      for (let i = 0; i < m.length; i++) {
        this.base[i * 3] += d.color[0] * m[i]; this.base[i * 3 + 1] += d.color[1] * m[i]; this.base[i * 3 + 2] += d.color[2] * m[i];
      }
    }
    const { d: dm, near } = depthMap(buf);
    this.near = near;
    const { fade, min } = s.depth ?? { fade: 24, min: 0.08 };
    this.depthF = new Float32Array(dm.length);
    for (let i = 0; i < dm.length; i++) this.depthF[i] = Math.max(0, 1 - Math.max(0, dm[i] - 1) / fade);
    this.deepMin = min;
    this.light = new Float32Array(this.hw * this.hh * 3);
    this.lightFull = new Float32Array(this.w * this.h * 3);
    this.col = new Float32Array(this.w * this.h * 3);
    this.grade = { tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0.25, bloom: 0.9, threshold: 0.75, exposure: 1, ...s.grade };
  }

  render(out: ImageData, t: number, view: View = "final"): void {
    const { w, h, hw, hh, work, s, light, lightFull, col, depthF, near, grade } = this;
    work.copyFrom(s.buf);
    s.frame?.(work, t);

    // Light: ambient + directional + flickering point lights, at half res.
    light.set(this.base);
    for (const { l, map, x0, y0, x1, y1 } of this.maps) {
      const f = l.flicker ?? 0, sd = l.seed ?? l.x * 7 + l.y;
      const k = l.intensity * (1 - f * 0.35 * (noise2(t * 9, sd) * 0.7 + noise2(t * 23, sd + 5) * 0.3));
      const [r, g, b] = l.color;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * hw + x, m = map[i] * k;
          if (m === 0) continue;
          light[i * 3] += r * m; light[i * 3 + 1] += g * m; light[i * 3 + 2] += b * m;
        }
    }
    upsample(light, hw, hh, lightFull, w, h);

    const back = s.backLit ?? 0.65;
    const lit = view !== "flat";
    for (let i = 0; i < w * h; i++) {
      const j = i * 3, kd = work.kind[i];
      let k0 = 1, k1 = 1, k2 = 1;
      if (view === "light") {
        col[j] = lightFull[j] * 0.6; col[j + 1] = lightFull[j + 1] * 0.6; col[j + 2] = lightFull[j + 2] * 0.6;
        continue;
      }
      if (lit && kd !== Kind.Sky) {
        if (kd === Kind.Solid && s.buf.kind[i] === Kind.Solid) {
          // Static solids take the light at their nearest open surface pixel, fading
          // with depth to a dim ambient so deep rock never shows where that light came from.
          const src = near[i] * 3, f = depthF[i], a = this.deepMin;
          k0 = lightFull[src] * f + s.ambient[0] * a; k1 = lightFull[src + 1] * f + s.ambient[1] * a; k2 = lightFull[src + 2] * f + s.ambient[2] * a;
        } else {
          const m = kd === Kind.Back ? back : 1;
          k0 = lightFull[j] * m; k1 = lightFull[j + 1] * m; k2 = lightFull[j + 2] * m;
        }
      }
      col[j] = work.alb[j] * k0 + work.emi[j];
      col[j + 1] = work.alb[j + 1] * k1 + work.emi[j + 1];
      col[j + 2] = work.alb[j + 2] * k2 + work.emi[j + 2];
    }

    if (view === "final" && grade.bloom > 0) this.bloom();

    // Tone map, grade, vignette, dither.
    const d = out.data;
    const [tr, tg, tb] = grade.tint, [lr, lg, lb] = grade.lift;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 3, o = i * 4;
        const vx = x / w - 0.5, vy = y / h - 0.5;
        const v = 1 - grade.vignette * (vx * vx + vy * vy) * 2.2;
        const dz = BAYER[(y & 3) * 4 + (x & 3)];
        d[o] = 255 * (soft(col[j] * grade.exposure * tr * v) + lr + dz);
        d[o + 1] = 255 * (soft(col[j + 1] * grade.exposure * tg * v) + lg + dz);
        d[o + 2] = 255 * (soft(col[j + 2] * grade.exposure * tb * v) + lb + dz);
        d[o + 3] = 255;
      }
  }

  /** Two-scale bloom from emission plus anything brighter than the threshold. */
  private bloom(): void {
    const { w, h, hw, hh, col, work, grade } = this;
    const half = new Float32Array(hw * hh * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 3, o = ((y >> 1) * hw + (x >> 1)) * 3;
        for (let c = 0; c < 3; c++) half[o + c] += (work.emi[j + c] * 0.8 + Math.max(0, col[j + c] - grade.threshold)) * 0.25;
      }
    const qw = Math.ceil(hw / 2), qh = Math.ceil(hh / 2);
    const quarter = new Float32Array(qw * qh * 3);
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < hw; x++) {
        const j = (y * hw + x) * 3, o = ((y >> 1) * qw + (x >> 1)) * 3;
        for (let c = 0; c < 3; c++) quarter[o + c] += half[j + c] * 0.25;
      }
    blur(half, hw, hh, 2); blur(half, hw, hh, 2);
    blur(quarter, qw, qh, 4); blur(quarter, qw, qh, 4);
    const a = new Float32Array(w * h * 3), b = new Float32Array(w * h * 3);
    upsample(half, hw, hh, a, w, h);
    upsample(quarter, qw, qh, b, w, h);
    const k = grade.bloom;
    for (let i = 0; i < col.length; i++) col[i] += k * (a[i] * 0.7 + b[i] * 1.1);
  }
}

const soft = (c: number) => (c < 0.8 ? c : 0.8 + 0.2 * (1 - Math.exp(-(c - 0.8) * 4)));

/** Bilinear upsample of an RGB float image. */
function upsample(src: Float32Array, sw: number, sh: number, dst: Float32Array, dw: number, dh: number): void {
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const v = Math.max(0, Math.min(sh - 1.001, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(v), ty = v - y0;
    for (let x = 0; x < dw; x++) {
      const u = Math.max(0, Math.min(sw - 1.001, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(u), tx = u - x0;
      const a = (y0 * sw + x0) * 3, b = a + 3, c = a + sw * 3, d = c + 3, o = (y * dw + x) * 3;
      for (let k = 0; k < 3; k++) {
        const top = src[a + k] + (src[b + k] - src[a + k]) * tx;
        const bot = src[c + k] + (src[d + k] - src[c + k]) * tx;
        dst[o + k] = top + (bot - top) * ty;
      }
    }
  }
}

/** Separable box blur in place. */
function blur(a: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[(y * w + Math.max(0, Math.min(w - 1, x))) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = acc / n;
        acc += a[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] - a[(y * w + Math.max(0, x - r)) * 3 + c];
      }
    }
  for (let x = 0; x < w; x++)
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[(Math.max(0, Math.min(h - 1, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        a[(y * w + x) * 3 + c] = acc / n;
        acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - tmp[(Math.max(0, y - r) * w + x) * 3 + c];
      }
    }
}

export const BLACK = hex("#000000");
