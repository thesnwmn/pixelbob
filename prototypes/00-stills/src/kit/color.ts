export type RGB = [number, number, number];

export function hex(s: string): RGB {
  const n = parseInt(s.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: RGB, b: RGB): RGB => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Pick from a ramp of colours by t in [0, 1] (no interpolation: keeps pixel-art banding). */
export function ramp(colors: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(colors.length - 1, Math.floor(t * colors.length)));
  return colors[i];
}

/** Interpolated ramp, for gradients like sky and fire. */
export function gradient(colors: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  return mix(colors[i], colors[i + 1], x - i);
}

/** Brightness jitter, used to give every material pixel a little grain. */
export const jitter = (c: RGB, amount: number, h: number): RGB => scale(c, 1 + (h - 0.5) * 2 * amount);
