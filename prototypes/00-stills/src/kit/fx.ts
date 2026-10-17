import { Buf, Kind } from "./buf.ts";
import { gradient, hex, type RGB } from "./color.ts";
import { fbm, hash1, noise2 } from "./rng.ts";

const FIRE: RGB[] = ["#3a0d08", "#8a1e0e", "#d8401a", "#ff7a1c", "#ffb53a", "#ffe58a", "#fffbe0"].map(hex);

/**
 * Flame as dancing pixels: a heat field that scrolls upward through noise and
 * cools with height, mapped through a fire ramp. In the game every one of
 * these is a short-lived "fire" cell (docs/simulation.md).
 */
export function flame(buf: Buf, cx: number, by: number, w: number, h: number, t: number, seed: number, k = 1): void {
  for (let y = Math.floor(by - h); y <= by; y++)
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
      const v = (by - y) / h; // 0 at the base, 1 at the top
      const u = (x - cx) / (w * (1 - v * 0.75) + 0.5);
      const n = fbm(x * 0.22, y * 0.16 + t * 7, seed, 3);
      const n2 = noise2(x * 0.5 + Math.sin(t * 3) * 0.6, y * 0.35 + t * 11, seed + 7);
      const heat = (1 - u * u) * (1.35 - v * 1.3) + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35 - v * 0.2;
      if (heat < 0.1) continue;
      const c = gradient(FIRE, Math.min(1, heat * 0.95));
      buf.set(x, y, c, Kind.Object, 0);
      buf.glow(x, y, c, k * Math.min(1.4, heat * 1.3));
    }
  // Sparks thrown off the top.
  for (let i = 0; i < 6; i++) {
    const life = 0.9 + hash1(i, seed) * 0.9;
    const age = (t + hash1(i, seed + 1) * life) % life;
    const x = cx + (hash1(i, seed + 2) - 0.5) * w * 1.4 + Math.sin(age * 9 + i) * 2;
    const y = by - h * 0.6 - age * h * 1.1;
    const c = age / life < 0.5 ? FIRE[5] : FIRE[3];
    buf.set(x, y, c, Kind.Object, 0);
    buf.glow(x, y, c, 1.2 * (1 - age / life));
  }
}

/** Rising, spreading, fading smoke or steam made of soft noisy pixel puffs. */
export function plume(buf: Buf, cx: number, by: number, h: number, t: number, seed: number, ramp: RGB[], alpha: number, spread = 0.35, speed = 14): void {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const life = h / speed;
    const age = (t + (i / n) * life) % life;
    const f = age / life;
    const py = by - age * speed;
    const px = cx + Math.sin(age * 1.3 + seed) * 4 * f + f * f * h * spread * (noise2(seed, i) - 0.3);
    const r = 2 + f * h * 0.22;
    for (let y = Math.floor(py - r); y <= py + r; y++)
      for (let x = Math.floor(px - r); x <= px + r; x++) {
        const d = Math.hypot(x - px, y - py) / r;
        const nn = fbm(x * 0.2, y * 0.2 - t * 0.8, seed + i, 2);
        const a = (1 - d) * 1.4 + (nn - 0.5) * 1.2;
        if (a <= 0.15) continue;
        buf.blend(x, y, ramp[Math.min(ramp.length - 1, Math.floor(nn * ramp.length))], Math.min(1, a) * alpha * (1 - f * 0.85), Kind.Fluid, 0.03);
      }
  }
}

/** Drifting glowing specks: spores, embers, fireflies, dust. */
export function motes(buf: Buf, n: number, t: number, seed: number, area: [number, number, number, number], color: RGB, glow: number, rise = 4): void {
  const [x0, y0, w, h] = area;
  for (let i = 0; i < n; i++) {
    const life = 5 + hash1(i, seed) * 6;
    const age = (t + hash1(i, seed + 1) * life) % life;
    const x = x0 + hash1(i, seed + 2) * w + Math.sin(age * 0.9 + i) * 6;
    const y = y0 + h - ((hash1(i, seed + 3) * h + age * rise) % h);
    const fade = Math.sin((age / life) * Math.PI);
    buf.set(x, y, color, Kind.Object, 0);
    buf.glow(x, y, color, glow * fade);
  }
}

/** Glints on a liquid surface row. */
export function shimmer(buf: Buf, x0: number, x1: number, y: number, t: number, seed: number, color: RGB, k = 0.6): void {
  for (let x = x0; x <= x1; x++) {
    const n = noise2(x * 0.15 - t * 1.5, t * 0.7, seed);
    if (n > 0.62) buf.blend(x, y, color, k * (n - 0.62) * 3);
    if (n > 0.8) buf.blend(x, y + 1, color, k * 0.5);
  }
}
