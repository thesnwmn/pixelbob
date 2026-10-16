import { Buf, Kind } from "./buf.ts";
import { mix, type RGB } from "./color.ts";
import { disc, line } from "./paint.ts";
import { fbm, fbm1, hash1, hash2, rng } from "./rng.ts";

/** Wind at column x and time t, in roughly [-1, 1]. Gusts roll across the screen. */
export function wind(x: number, t: number, strength = 1): number {
  return strength * ((fbm1(x * 0.006 - t * 0.35, 77, 3) - 0.5) * 2.4 + Math.sin(t * 1.9 + x * 0.04) * 0.25);
}

export interface Blade { x: number; y: number; h: number; c: RGB; tip: RGB; flower?: RGB; ph: number }

/** Grass blades (and the odd flower) on the given surface points. */
export function grass(points: { x: number; y: number }[], seed: number, opts: { density: number; height: number; ramp: RGB[]; flowers?: RGB[]; flowerRate?: number }): Blade[] {
  const out: Blade[] = [];
  for (const p of points) {
    const r = hash2(p.x, p.y, seed);
    if (r > opts.density) continue;
    const h = 1 + Math.floor(hash2(p.x, p.y, seed + 1) * opts.height * (0.5 + fbm1(p.x * 0.05, seed)));
    const c = opts.ramp[Math.floor(hash2(p.x, p.y, seed + 2) * (opts.ramp.length - 1))];
    const tip = opts.ramp[opts.ramp.length - 1];
    const fl = opts.flowers && hash2(p.x, p.y, seed + 3) < (opts.flowerRate ?? 0.04) ? opts.flowers[Math.floor(hash2(p.x, p.y, seed + 4) * opts.flowers.length)] : undefined;
    out.push({ x: p.x, y: p.y - 1, h: fl ? h + 2 : h, c, tip, flower: fl, ph: r * 6.28 });
  }
  return out;
}

export function drawGrass(buf: Buf, blades: Blade[], t: number, windK = 1, glow = 0): void {
  for (const b of blades) {
    const lean = wind(b.x, t, windK) * 1.6 + Math.sin(t * 3 + b.ph) * 0.25;
    for (let k = 0; k < b.h; k++) {
      const f = (k + 1) / b.h;
      const x = b.x + Math.round(lean * f * f * Math.min(3, b.h) * 0.6);
      const y = b.y - k;
      if (buf.solidAt(x, y)) break;
      buf.set(x, y, k === b.h - 1 ? b.tip : b.c, Kind.Object, 0.1);
      if (glow) buf.glow(x, y, b.c, glow * f);
      if (b.flower && k === b.h - 1) {
        buf.set(x, y - 1, b.flower, Kind.Object, 0.1);
        buf.set(x - 1, y, b.flower, Kind.Object, 0.1);
        buf.set(x + 1, y, b.flower, Kind.Object, 0.1);
        buf.set(x, y, [1, 0.92, 0.5], Kind.Object, 0.1);
      }
    }
  }
}

interface Px { x: number; y: number; c: RGB; f: number; ph: number }
export interface Tree { trunk: Px[]; leaves: Px[]; x: number; y: number; h: number }

/** A broadleaf tree: a bent trunk, a few branches and noisy leaf clusters with top-left light. */
export function tree(x: number, y: number, h: number, seed: number, leafRamp: RGB[], barkRamp: RGB[]): Tree {
  const r = rng(seed);
  const trunk: Px[] = [], leaves: Px[] = [];
  const clusters: [number, number, number][] = [];
  const bend = (r() - 0.5) * h * 0.3;
  let px = x, py = y;
  const steps = Math.round(h);
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const cx = x + bend * f * f, cy = y - h * f;
    const wdt = f < 0.15 ? 2 : f < 0.7 ? 1 : 0;
    line(px, py, cx, cy, (lx, ly) => {
      for (let k = -wdt; k <= wdt; k++) trunk.push({ x: lx + k, y: ly, c: barkRamp[Math.min(barkRamp.length - 1, Math.max(0, k + 1 + (hash2(lx, ly, seed) > 0.7 ? 1 : 0)))], f, ph: 0 });
    });
    if (f > 0.45 && f < 0.92 && r() < 0.22) {
      const dir = r() < 0.5 ? -1 : 1, len = h * (0.25 + r() * 0.3);
      const ex = cx + dir * len, ey = cy - len * (0.3 + r() * 0.5);
      line(cx, cy, ex, ey, (lx, ly) => trunk.push({ x: lx, y: ly, c: barkRamp[1], f, ph: 0 }));
      clusters.push([ex, ey, h * (0.18 + r() * 0.12)]);
    }
    px = cx; py = cy;
  }
  clusters.push([px, py, h * 0.32]);
  clusters.push([px - h * 0.18, py + h * 0.1, h * 0.22], [px + h * 0.2, py + h * 0.06, h * 0.22]);
  const seen = new Set<number>();
  for (const [cx, cy, cr] of clusters) {
    disc(cx, cy, cr * 1.3, (lx, ly) => {
      const dx = (lx - cx) / cr, dy = (ly - cy) / cr;
      const d = Math.hypot(dx, dy);
      if (d + (fbm(lx * 0.25, ly * 0.25, seed) - 0.5) * 1.1 > 1) return;
      const k = ly * 65536 + lx;
      if (seen.has(k)) return;
      seen.add(k);
      // Light from top-left; sparse gaps; darker underside.
      const light = 0.55 - dx * 0.3 - dy * 0.45 + (hash2(lx, ly, seed + 9) - 0.5) * 0.35;
      if (hash2(lx, ly, seed + 3) < 0.06) return;
      const c = leafRamp[Math.max(0, Math.min(leafRamp.length - 1, Math.floor(light * leafRamp.length)))];
      leaves.push({ x: lx, y: ly, c, f: Math.max(0, (y - ly) / h), ph: hash2(lx, ly, seed + 5) * 6.28 });
    }, 0.8);
  }
  return { trunk, leaves, x, y, h };
}

export function drawTree(buf: Buf, tr: Tree, t: number, windK = 1): void {
  const w = wind(tr.x, t, windK);
  for (const p of tr.trunk) {
    const dx = Math.round(w * p.f * p.f * tr.h * 0.06);
    buf.set(p.x + dx, p.y, p.c, Kind.Object, 0.6);
  }
  for (const p of tr.leaves) {
    // Whole-canopy sway + per-leaf flutter that gets stronger with gusts.
    const flutter = Math.sin(t * (5 + p.ph) + p.ph) * (0.4 + Math.abs(w) * 0.9);
    const dx = Math.round(w * p.f * p.f * tr.h * 0.1 + flutter);
    const dy = Math.round(Math.cos(t * 4 + p.ph * 2) * 0.35 * Math.abs(w));
    buf.set(p.x + dx, p.y + dy, p.c, Kind.Object, 0.35);
  }
}

/** Leaves (or petals, snow) torn off and carried by the wind. */
export function blownLeaves(buf: Buf, n: number, t: number, seed: number, area: [number, number, number, number], colors: RGB[], windK = 1): void {
  const [x0, y0, w, h] = area;
  for (let i = 0; i < n; i++) {
    const life = 4 + hash1(i, seed) * 4;
    const age = (t + hash1(i, seed + 1) * life) % life;
    const sx = x0 + hash1(i, seed + 2) * w, sy = y0 + hash1(i, seed + 3) * h * 0.5;
    const x = sx + age * (14 + wind(sx, t, windK) * 18) + Math.sin(age * 3 + i) * 3;
    const y = sy + age * (6 + hash1(i, seed + 4) * 6) + Math.sin(age * 5 + i) * 2;
    buf.set(Math.round(x) % buf.w, y, colors[i % colors.length], Kind.Object, 0);
  }
}

export interface Vine { x: number; y: number; len: number; seed: number; bulb?: RGB }

export function drawVine(buf: Buf, v: Vine, t: number, ramp: RGB[], sway = 1): void {
  let lastX = v.x;
  for (let k = 1; k <= v.len; k++) {
    const f = k / v.len;
    const x = Math.round(v.x + Math.sin(k * 0.22 + v.seed) * 2.5 * f + Math.sin(t * 1.3 + v.seed) * sway * f * f * 2.5);
    const y = v.y + k;
    if (buf.solidAt(x, y)) break;
    const c = ramp[(k + v.seed) % ramp.length];
    buf.set(x, y, c, Kind.Object, 0.1);
    if (Math.abs(x - lastX) > 1) buf.set((x + lastX) >> 1, y, c, Kind.Object, 0.1);
    if (k % 5 === 0) buf.set(x + (k % 10 === 0 ? 1 : -1), y, ramp[0], Kind.Object, 0.1);
    lastX = x;
    if (k === v.len && v.bulb) {
      const pulse = 0.8 + Math.sin(t * 2 + v.seed) * 0.2;
      for (const [bx, by] of [[0, 1], [0, 2], [-1, 1], [1, 1]] as const) {
        buf.set(x + bx, y + by, mix(v.bulb, [1, 1, 1], by === 1 && bx === 0 ? 0.5 : 0), Kind.Object, 0);
        buf.glow(x + bx, y + by, v.bulb, 0.9 * pulse);
      }
    }
  }
}
