import { Buf, Kind } from "./buf.ts";
import { mix, type RGB } from "./color.ts";

export type Plot = (x: number, y: number) => void;

export function disc(cx: number, cy: number, r: number, plot: Plot, sy = 1): void {
  for (let y = Math.floor(cy - r * sy); y <= Math.ceil(cy + r * sy); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = (x - cx) / r, dy = (y - cy) / (r * sy);
      if (dx * dx + dy * dy <= 1) plot(x, y);
    }
}

export function rect(x0: number, y0: number, w: number, h: number, plot: Plot): void {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) plot(x, y);
}

export function line(x0: number, y0: number, x1: number, y1: number, plot: Plot): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Thick line, for trunks, pipes and stream-of-material shapes. */
export function stroke(x0: number, y0: number, x1: number, y1: number, r: number, plot: Plot): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const seen = new Set<number>();
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, (x, y) => {
      const k = y * 65536 + x;
      if (!seen.has(k)) { seen.add(k); plot(x, y); }
    });
  }
}

/** Every pixel of the buffer. */
export function each(buf: Buf, plot: Plot): void {
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) plot(x, y);
}

const isOpen = (buf: Buf, x: number, y: number) => buf.inside(x, y) && buf.kindAt(x, y) !== Kind.Solid;

/** Solid pixels with open space directly above: where grass, moss and Bob stand. */
export function tops(buf: Buf): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 1; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (buf.solidAt(x, y) && isOpen(buf, x, y - 1)) out.push({ x, y });
  return out;
}

/** Solid pixels with open space directly below: ceilings, for vines and icicles. */
export function bottoms(buf: Buf): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < buf.h - 1; y++) for (let x = 0; x < buf.w; x++) if (buf.solidAt(x, y) && isOpen(buf, x, y + 1)) out.push({ x, y });
  return out;
}

/**
 * Lighten solid pixels near open space: the dusty rim that makes cave
 * silhouettes readable in the reference shots.
 */
export function rim(buf: Buf, color: RGB, k: number, width = 2): void {
  const hit: number[] = [];
  for (let y = 0; y < buf.h; y++)
    for (let x = 0; x < buf.w; x++) {
      if (!buf.solidAt(x, y)) continue;
      let d = 0;
      for (let r = 1; r <= width && !d; r++)
        if (isOpen(buf, x + r, y) || isOpen(buf, x - r, y) || isOpen(buf, x, y + r) || isOpen(buf, x, y - r)) d = r;
      if (d) hit.push(x, y, d);
    }
  for (let i = 0; i < hit.length; i += 3) {
    const [x, y, d] = [hit[i], hit[i + 1], hit[i + 2]];
    const up = isOpen(buf, x, y - d) ? 1.3 : 1; // top edges catch more light
    buf.set(x, y, mix(buf.get(x, y), color, Math.min(1, (k * up) / d)), Kind.Solid, buf.occ[buf.idx(x, y)]);
  }
}
