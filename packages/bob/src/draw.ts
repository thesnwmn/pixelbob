import { CAT, Cat, hash2, type World } from "@pixelbob/sim";
import type { BobView } from "./model.ts";
import { frozenness, runniness } from "./tweaks.ts";

export type RGB = [number, number, number];
const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Bob's colours, 0..255: lit side, body, shadow side and the darker rim. */
export interface BobColors { body: RGB; light: RGB; dark: RGB; rim: RGB }

/**
 * Colours Bob can be. Rose is his default (docs/02-art-direction.md says why); the
 * others are for comparing, and for the times gameplay wants him a different colour.
 */
export const BOB_COLORS: Record<string, BobColors & { name: string }> = {
  rose: { name: "Rose", body: hex(0xff6a92), light: hex(0xffb8c6), dark: hex(0xc63a6c), rim: hex(0x6a1644) },
  bubblegum: { name: "Bubblegum", body: hex(0xff5fae), light: hex(0xffb6dc), dark: hex(0xc2347e), rim: hex(0x5e1446) },
  coral: { name: "Coral", body: hex(0xff6f86), light: hex(0xffb7b0), dark: hex(0xc53b62), rim: hex(0x6e1840) },
  cyan: { name: "Jelly cyan", body: hex(0x45d3e6), light: hex(0xb6fbf5), dark: hex(0x1f86b0), rim: hex(0x0d3f66) },
  lime: { name: "Lime", body: hex(0xa6e04a), light: hex(0xe4ffa8), dark: hex(0x4f9c2a), rim: hex(0x23501b) },
  amber: { name: "Amber", body: hex(0xffb63d), light: hex(0xffe7a2), dark: hex(0xc96d18), rim: hex(0x6b330c) },
  white: { name: "Milk", body: hex(0xe8e4f0), light: hex(0xffffff), dark: hex(0x9a94b0), rim: hex(0x3c3654) },
};

// State tints: cold goes icy, hot goes molten whatever colour he is.
const ICE: BobColors = { body: hex(0xc0e4f4), light: hex(0xf4fbff), dark: hex(0x7fa8cc), rim: hex(0x2c4a72) };
const HOT: BobColors = { body: hex(0xff6a2a), light: hex(0xffd46e), dark: hex(0xc8361a), rim: hex(0x5e1208) };
const EYE = hex(0x1a0d1c);

/**
 * Where a pixel of Bob goes: colour (0..255), how opaque it is over what's behind (1 at
 * the rim, less inside: he's translucent), and how much of his own colour he gives off
 * as light (so he keeps his colour in the dark).
 */
export type PutPixel = (x: number, y: number, c: RGB, alpha: number, glow: number) => void;

const scratch = {
  field: new Float32Array(0), blur: new Float32Array(0), smooth: new Float32Array(0),
  heat: new Float32Array(0), own: new Uint8Array(0),
};

/**
 * Paints Bob: a smoothed density field over his particles, so he reads as one jelly with
 * a fizzy edge; each torn-off bit is drawn the same way. Shared by the game renderer
 * (BobPainter, below) and the stills, so they look the same. `solid` says where the
 * ground is: his pixels never draw inside it, which is what presses him onto it.
 */
export function paintBob(blob: BobView, solid: (x: number, y: number) => boolean, put: PutPixel, frame: number, colors: BobColors = BOB_COLORS.rose): void {
  blob.pieces.forEach((_, pi) => piece(blob, solid, put, frame, pi, colors));
}

function piece(blob: BobView, solid: (x: number, y: number) => boolean, put: PutPixel, frame: number, pi: number, C: BobColors): void {
  const p = blob.pieces[pi], { x, y, t, order } = blob;
  if (!p.len) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = p.start; k < p.start + p.len; k++) {
    const i = order[k];
    x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]);
  }
  if (!Number.isFinite(x0 + x1 + y0 + y1) || x1 - x0 > 4000 || y1 - y0 > 4000) return;
  const bx = Math.floor(x0) - 3, by = Math.floor(y0) - 3;
  const fw = Math.ceil(x1) + 4 - bx, fh = Math.ceil(y1) + 4 - by, n = fw * fh;
  if (scratch.field.length < n) {
    scratch.field = new Float32Array(n * 2); scratch.blur = new Float32Array(n * 2); scratch.smooth = new Float32Array(n * 2);
    scratch.heat = new Float32Array(n * 2); scratch.own = new Uint8Array(n * 2);
  }
  const { field, blur, smooth, heat, own } = scratch;
  field.fill(0, 0, n); heat.fill(0, 0, n); own.fill(0, 0, n); blur.fill(0, 0, n); smooth.fill(0, 0, n);
  // Splat each particle into the four cells around it.
  for (let k = p.start; k < p.start + p.len; k++) {
    const i = order[k], fx = x[i] - 0.5 - bx, fy = y[i] - 0.5 - by;
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const T = blob.fixedTemp ?? t[i];
    for (const [ox, oy, wgt] of [[0, 0, (1 - ax) * (1 - ay)], [1, 0, ax * (1 - ay)], [0, 1, (1 - ax) * ay], [1, 1, ax * ay]] as const) {
      const c = (iy + oy) * fw + ix + ox;
      field[c] += wgt; heat[c] += wgt * T;
    }
    own[Math.floor(y[i] - by) * fw + Math.floor(x[i] - bx)] = 1;
  }
  // Soften with a 3×3 tent blur: once for the outline, twice more for smooth shading normals.
  const tent = (src: Float32Array, dst: Float32Array) => {
    for (let yy = 1; yy < fh - 1; yy++)
      for (let xx = 1; xx < fw - 1; xx++) {
        const c = yy * fw + xx;
        dst[c] = (src[c] * 4 + (src[c - 1] + src[c + 1] + src[c - fw] + src[c + fw]) * 2 +
          src[c - fw - 1] + src[c - fw + 1] + src[c + fw - 1] + src[c + fw + 1]) / 16;
      }
  };
  // Temperature per cell from the particles splatted there (the piece's average elsewhere).
  for (let c = 0; c < n; c++) heat[c] = field[c] > 0.02 ? heat[c] / field[c] : p.temp;
  tent(field, blur);
  tent(blur, smooth);
  tent(smooth, field);
  const fr = frame >> 2;
  const thr = (xx: number, yy: number) => 0.3 + (hash2(xx + bx + fr * 7, yy + by - fr * 3, pi + 5) - 0.5) * 0.16;
  const inside = (xx: number, yy: number) => {
    if (xx < 1 || yy < 1 || xx >= fw - 1 || yy >= fh - 1) return false;
    const c = yy * fw + xx;
    return (blur[c] >= thr(xx, yy) || own[c] === 1) && !solid(xx + bx, yy + by);
  };

  // The top of the piece over its middle, for the highlight and eyes.
  const mid = Math.round(p.cx) - bx;
  let topY = fh;
  for (let yy = 1; yy < fh - 1 && topY === fh; yy++) for (let dx = -1; dx <= 1; dx++) if (inside(mid + dx, yy)) { topY = yy; break; }

  for (let yy = 1; yy < fh - 1; yy++)
    for (let xx = 1; xx < fw - 1; xx++) {
      if (!inside(xx, yy)) continue;
      const c = yy * fw + xx, wx = xx + bx, wy = yy + by;
      const T = heat[c];
      const fz = frozenness(T), rn = runniness(T);
      const edge = !inside(xx - 1, yy) || !inside(xx + 1, yy) || !inside(xx, yy - 1) || !inside(xx, yy + 1);
      // (field now holds the thrice-blurred density.)
      let nx = field[c - 1] - field[c + 1], ny = field[c - fw] - field[c + fw];
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      if (fz > 0.5) {
        // Frozen: facets, like cut glass.
        const a = Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) * (Math.PI / 4);
        nx = Math.cos(a); ny = Math.sin(a);
      }
      const depth = Math.min(1, Math.max(0, (field[c] - 0.25) * 1.4));
      let lum = 0.52 + (-nx * 0.5 - ny * 0.62) * (1 - depth * 0.55) + (hash2(wx, wy, 3) - 0.5) * 0.06;
      if (fz > 0.5) lum = Math.round(lum * 3) / 3;
      const tint = (key: keyof BobColors) => mix(mix(C[key], ICE[key], fz * 0.85), HOT[key], rn * 0.75);
      let col = lum > 0.8 ? tint("light") : lum > 0.5 ? tint("body") : lum > 0.28 ? mix(tint("body"), tint("dark"), 0.5) : tint("dark");
      // Light passing through the jelly glows near his underside.
      if (fz < 0.5 && ny > 0.6 && !edge) col = mix(col, tint("light"), 0.3);
      const h1 = hash2(wx + fr * 3, wy, 11);
      if (!edge && h1 < 0.03) col = mix(col, tint("light"), 0.6);
      else if (!edge && h1 > 0.95) col = mix(col, tint("dark"), 0.5);
      if (edge && lum <= 0.75) col = tint("rim");
      // Translucent inside, solid at the rim; frozen is clearer, runny more see-through.
      const al = edge ? 1 : fz > 0.5 ? 0.9 : 0.8 - rn * 0.1;
      // Self-light so he keeps his colour in the dark; hot Bob glows.
      put(wx, wy, col, al, 0.14 + rn * 0.25);
    }

  const set = (xx: number, yy: number, c: RGB, alpha = 1, glow = 0) => {
    if (inside(xx, yy)) put(xx + bx, yy + by, c, alpha, glow);
  };
  const R = p.radius;
  if (R < 3 || topY >= fh) return;
  const fz = frozenness(p.temp), rn = runniness(p.temp);
  // Specular highlight, top-left.
  const hx = mid - Math.round(R * 0.45), hy = topY + Math.round(R * 0.3);
  const spec: [number, number, number][] = R > 6 ? [[0, 0, 1], [1, -1, 1], [2, -1, 0.7], [-1, 1, 0.7], [0, 1, 0.5]] : [[0, 0, 1], [1, 0, 0.6]];
  for (const [dx, dy, k] of spec) set(hx + dx, hy + dy, [255, 255, 255], k);
  if (pi !== 0 || p.len < 12) return;
  // Eyes: on the main piece, looking where he's going.
  const look = Math.max(-2, Math.min(2, Math.round(p.vx / 30))) || blob.facing;
  const ex = mid + look, ey = topY + Math.max(2, Math.round(R * 0.4));
  const blink = hash2(frame >> 3, 1, 9) > 0.97;
  const big = R > 7;
  for (const px of big ? [ex - 4, ex + 2] : [ex - 3, ex + 1]) {
    if (fz > 0.5 || blink) { set(px, ey + 1, EYE); set(px + 1, ey + 1, EYE); continue; }
    const droop = rn > 0.5 ? 1 : 0, hgt = big ? 3 : 2;
    for (let k = droop; k < hgt; k++) { set(px, ey + k, EYE); set(px + 1, ey + k, EYE); }
    set(px + 1, ey + droop, [255, 255, 255], 1, 0.4);
  }
}

/**
 * Draws Bob into the game renderer's colour and emission textures (see
 * packages/render/src/shade.ts for their layout), after the world has been shaded.
 */
export class BobPainter {
  colors: BobColors = BOB_COLORS.rose;

  draw(blob: BobView, world: World, color: Uint8Array, emit: Uint8Array, frame: number): void {
    const W = world.w, H = world.h;
    const solid = (wx: number, wy: number) => {
      if (wx < 0 || wy < 0 || wx >= W || wy >= H) return true;
      const c = CAT[world.mat[wy * W + wx]];
      return c === Cat.Static || c === Cat.Powder;
    };
    paintBob(blob, solid, (wx, wy, c, al, glow) => {
      const o = (wy * W + wx) * 4;
      color[o] = color[o] * (1 - al) + c[0] * al;
      color[o + 1] = color[o + 1] * (1 - al) + c[1] * al;
      color[o + 2] = color[o + 2] * (1 - al) + c[2] * al;
      color[o + 3] = 200;
      if (glow) {
        emit[o] = Math.min(255, emit[o] + c[0] * glow * 0.5);
        emit[o + 1] = Math.min(255, emit[o + 1] + c[1] * glow * 0.5);
        emit[o + 2] = Math.min(255, emit[o + 2] + c[2] * glow * 0.5);
      }
      emit[o + 3] = Math.max(emit[o + 3], 90);
    }, frame, this.colors);
  }
}
