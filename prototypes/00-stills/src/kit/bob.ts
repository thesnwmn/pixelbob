import { Buf, Kind } from "./buf.ts";
import { hex, mix, type RGB } from "./color.ts";
import { hash2 } from "./rng.ts";

export interface BobPalette { name: string; body: RGB; light: RGB; dark: RGB; rim: RGB }

export const PALETTES: Record<string, BobPalette> = {
  coral: { name: "Coral", body: hex("#ff6f86"), light: hex("#ffb7b0"), dark: hex("#c53b62"), rim: hex("#6e1840") },
  cyan: { name: "Jelly cyan", body: hex("#45d3e6"), light: hex("#b6fbf5"), dark: hex("#1f86b0"), rim: hex("#0d3f66") },
  lime: { name: "Lime", body: hex("#a6e04a"), light: hex("#e4ffa8"), dark: hex("#4f9c2a"), rim: hex("#23501b") },
  amber: { name: "Amber", body: hex("#ffb63d"), light: hex("#ffe7a2"), dark: hex("#c96d18"), rim: hex("#6b330c") },
};

export type BobState = "normal" | "cold" | "hot" | "wet";

/** One lobe of Bob's body. Bob's outline is the metaball union of his lobes. */
export interface Lobe { x: number; y: number; r: number; sx?: number; sy?: number }

export interface BobOpts {
  palette: BobPalette;
  state?: BobState;
  t?: number;
  /** Eye position (centre between the two eyes), or null for a headless fragment. */
  eyes?: { x: number; y: number; look?: number; size?: number } | null;
  seed?: number;
  /**
   * How visibly Bob is a cluster of particles rather than a solid sprite, 0..1.
   * Higher = fizzier outline, more gaps, more stray pixels.
   */
  loose?: number;
  /** Self-illumination so his hue survives dark or strongly tinted light. */
  selfLit?: number;
}

const ICE = hex("#d5f1ff"), HOT = hex("#ff5a1e"), WATER = hex("#8fd6ff");

function stateColors(p: BobPalette, s: BobState): BobPalette {
  if (s === "cold") return { ...p, body: mix(p.body, ICE, 0.6), light: mix(p.light, [1, 1, 1], 0.6), dark: mix(p.dark, hex("#5f8fb8"), 0.6), rim: mix(p.rim, hex("#28466e"), 0.6) };
  if (s === "hot") return { ...p, body: mix(p.body, HOT, 0.7), light: mix(p.light, hex("#ffd06a"), 0.75), dark: mix(p.dark, hex("#c2300e"), 0.7), rim: mix(p.rim, hex("#5a0e08"), 0.6) };
  if (s === "wet") return { ...p, body: mix(p.body, WATER, 0.3), light: mix(p.light, [1, 1, 1], 0.4) };
  return p;
}

/**
 * Draw Bob from metaball lobes. He's translucent jelly: interior pixels blend
 * over what's behind him, the rim is opaque, light comes from the top-left.
 * In the game each of these pixels is a particle (docs/03-simulation.md);
 * here we fake the look from a field.
 */
export function drawBob(buf: Buf, lobes: Lobe[], o: BobOpts): void {
  const state = o.state ?? "normal", t = o.t ?? 0, seed = o.seed ?? 3;
  const p = stateColors(o.palette, state);
  const field = (x: number, y: number) => {
    let f = 0;
    for (const l of lobes) {
      const dx = (x - l.x) / (l.sx ?? 1), dy = (y - l.y) / (l.sy ?? 1);
      f += (l.r * l.r) / (dx * dx + dy * dy + 0.01);
    }
    return f;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lobes) {
    x0 = Math.min(x0, l.x - l.r * 2 * (l.sx ?? 1)); x1 = Math.max(x1, l.x + l.r * 2 * (l.sx ?? 1));
    y0 = Math.min(y0, l.y - l.r * 2 * (l.sy ?? 1)); y1 = Math.max(y1, l.y + l.r * 2 * (l.sy ?? 1));
  }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const loose = o.loose ?? 0.6;
  const fr = Math.floor(t * 12);
  // Each pixel is a particle: near the surface they jostle in and out, so the
  // threshold wobbles per pixel per frame. Pixels inside terrain are skipped,
  // which is what makes him read as pressed onto the ground.
  const inside = (x: number, y: number) =>
    !buf.solidAt(x, y) && field(x + 0.5, y + 0.5) >= 1 + (hash2(x * 7 + fr, y * 13 - fr, seed + 5) - 0.5) * 0.7 * loose;
  const alpha = state === "wet" ? 0.62 : state === "cold" ? 0.9 : 0.8;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      // Normal from the field gradient: points outward.
      const gx = field(x - 0.5, y + 0.5) - field(x + 1.5, y + 0.5);
      const gy = field(x + 0.5, y - 0.5) - field(x + 0.5, y + 1.5);
      const gl = Math.hypot(gx, gy) || 1;
      let nx = gx / gl, ny = gy / gl;
      const depth = Math.min(1, (field(x + 0.5, y + 0.5) - 1) * 0.6);
      if (state === "cold") {
        // Facets: snap normals to 8 directions for a cut-glass look.
        const a = Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) * (Math.PI / 4);
        nx = Math.cos(a); ny = Math.sin(a);
      }
      let lum = 0.52 + (-nx * 0.5 - ny * 0.62) * (1 - depth * 0.55) + (hash2(x, y, seed) - 0.5) * 0.06;
      if (state === "cold") lum = Math.round(lum * 3) / 3;
      let c: RGB = lum > 0.8 ? p.light : lum > 0.5 ? p.body : lum > 0.28 ? mix(p.body, p.dark, 0.5) : p.dark;
      // Subsurface glow near the bottom: light passing through the jelly.
      if (state !== "cold" && ny > 0.6 && !edge) c = mix(c, p.light, 0.3);
      if (edge) {
        buf.set(x, y, lum > 0.75 ? p.body : p.rim, Kind.Object, 0.2);
      } else {
        buf.blend(x, y, c, alpha, Kind.Object, 0.2);
      }
      // Loose particles inside: lighter specks and the odd gap showing what's behind.
      const h1 = hash2(x + fr * 3, y, seed + 1);
      if (!edge && h1 < 0.03 * loose) buf.blend(x, y, p.light, 0.6);
      else if (!edge && h1 > 1 - 0.05 * loose) buf.blend(x, y, p.dark, 0.5);
      // Self-light so he keeps his colour in dark or strongly tinted light (a readability choice).
      buf.glow(x, y, c, (o.selfLit ?? 0.14) + (state === "hot" ? 0.2 : 0));
    }

  // Stray particles orbiting just outside the surface.
  for (const l of lobes) {
    if (l.r < 4) continue;
    const n = Math.round(l.r * loose * 0.8);
    for (let i = 0; i < n; i++) {
      const a = hash2(i, fr >> 1, seed + 9) * Math.PI * 2;
      const rr = l.r * (1.05 + hash2(i, (fr >> 1) + 1, seed + 9) * 0.25);
      const sx = Math.round(l.x + Math.cos(a) * rr * (l.sx ?? 1)), sy = Math.round(l.y + Math.sin(a) * rr * (l.sy ?? 1));
      if (inside(sx, sy) || buf.solidAt(sx, sy)) continue;
      buf.blend(sx, sy, p.body, 0.85, Kind.Object, 0.1);
    }
  }

  // Specular highlight on each big lobe: a short bright arc, top-left.
  for (const l of lobes) {
    if (l.r < 3.5) continue;
    const sy = l.sy ?? 1;
    const hx = Math.round(l.x - l.r * 0.5 * (l.sx ?? 1)), hy = Math.round(l.y - l.r * 0.55 * sy);
    const pts: [number, number, number][] = l.r > 6 ? [[0, 0, 1], [1, -1, 1], [2, -1, 0.7], [-1, 1, 0.7], [0, 1, 0.5]] : [[0, 0, 1], [1, 0, 0.6]];
    for (const [dx, dy, k] of pts) {
      if (!inside(hx + dx, hy + dy)) continue;
      buf.blend(hx + dx, hy + dy, [1, 1, 1], k, Kind.Object, 0.2);
      buf.glow(hx + dx, hy + dy, [1, 1, 1], 0.15 * k);
    }
  }

  if (state === "cold") {
    // Cracks: jagged walks from the edge inward; and twinkling frost.
    const l = lobes[0];
    for (let c = 0; c < 3; c++) {
      let cx = l.x + Math.cos(c * 2.1 + 0.5) * l.r * 0.9, cy = l.y + Math.sin(c * 2.1 + 0.5) * l.r * 0.9 * (l.sy ?? 1);
      for (let s = 0; s < l.r * 0.9; s++) {
        if (inside(Math.round(cx), Math.round(cy))) buf.set(cx, cy, mix(p.dark, p.rim, 0.5), Kind.Object, 0.2);
        cx += (l.x - cx) / (l.r - s + 1) + (hash2(c, s, seed) - 0.5) * 1.6;
        cy += (l.y - cy) / (l.r - s + 1) + (hash2(s, c, seed) - 0.5) * 1.6;
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = hash2(i, 1, seed) * 6.28, rr = l.r * (0.9 + hash2(i, 2, seed) * 0.4);
      const tw = Math.sin(t * 3 + i * 1.7);
      if (tw > 0.3) { buf.set(l.x + Math.cos(a) * rr, l.y + Math.sin(a) * rr, [1, 1, 1], Kind.Object, 0); buf.glow(l.x + Math.cos(a) * rr, l.y + Math.sin(a) * rr, ICE, tw * 0.8); }
    }
  }
  if (state === "hot") {
    // Bubbles rising through him.
    for (const l of lobes) {
      if (l.r < 4) continue;
      for (let i = 0; i < 3; i++) {
        const age = (t * 0.8 + i / 3) % 1;
        const bx = Math.round(l.x + (hash2(i, 7, seed) - 0.5) * l.r), by = Math.round(l.y + l.r * (l.sy ?? 1) * (0.6 - age * 1.2));
        if (inside(bx, by)) { buf.set(bx, by, p.light, Kind.Object, 0.2); buf.glow(bx, by, p.light, 0.3); }
      }
    }
  }
  if (state === "wet") {
    const l = lobes[0];
    for (let i = 0; i < 5; i++) {
      const bx = Math.round(l.x + (hash2(i, 3, seed) - 0.5) * l.r * 1.2), by = Math.round(l.y + (hash2(i, 4, seed) - 0.3) * l.r);
      if (inside(bx, by)) { buf.set(bx, by, [0.85, 0.97, 1], Kind.Object, 0.2); buf.set(bx + 1, by, mix(p.light, [1, 1, 1], 0.3), Kind.Object, 0.2); }
    }
  }

  if (o.eyes) {
    const { x, y } = o.eyes;
    const look = Math.round(o.eyes.look ?? 0);
    const blink = Math.sin(t * 0.9 + seed) > 0.985;
    const eye = hex("#1a0d1c");
    const big = (o.eyes.size ?? 1) > 1;
    for (const ex of big ? [x - 5, x + 3] : [x - 4, x + 2]) {
      const px = ex + look;
      if (state === "cold" || blink) {
        // Squint: a flat line.
        buf.set(px, y + 1, eye, Kind.Object, 0.2); buf.set(px + 1, y + 1, eye, Kind.Object, 0.2);
        continue;
      }
      const droop = state === "hot" ? 1 : 0;
      const hgt = big ? 4 : 3;
      for (let k = droop; k < hgt; k++) {
        buf.set(px, y + k, eye, Kind.Object, 0.2);
        buf.set(px + 1, y + k, eye, Kind.Object, 0.2);
        if (big) buf.set(px + 2, y + k, eye, Kind.Object, 0.2);
      }
      buf.set(px + (big ? 2 : 1), y + droop, [1, 1, 1], Kind.Object, 0.2);
      if (big) buf.set(px + 2, y + droop + 1, [1, 1, 1], Kind.Object, 0.2);
    }
  }
}

/**
 * Standard idle Bob: a squashy dome that breathes and settles onto the ground
 * under him (his feet follow the slope).
 */
export function idleBob(cx: number, ground: (x: number) => number, r: number, t: number, squash = 0): Lobe[] {
  const breathe = Math.sin(t * 2.2) * 0.05 + squash;
  const sy = 0.8 - breathe;
  const rr = r * (1 + breathe * 0.4);
  const gl = ground(cx - rr * 0.6), gr = ground(cx + rr * 0.6), gc = Math.min(gl, gr, ground(cx));
  return [
    { x: cx, y: gc - rr * sy + 1, r: rr, sy },
    { x: cx - rr * 0.6, y: gl - rr * 0.32 + 1, r: rr * 0.55, sy: 0.65 },
    { x: cx + rr * 0.6, y: gr - rr * 0.32 + 1, r: rr * 0.55, sy: 0.65 },
  ];
}

/**
 * Bob on the move: stretched along his velocity, leaning into it, with a
 * trailing lobe and droplets that haven't caught up yet. vx in "Bob radii per
 * second"-ish units; sign is direction.
 */
export function movingBob(cx: number, ground: (x: number) => number, r: number, vx: number, t: number): Lobe[] {
  const dir = Math.sign(vx) || 1, s = Math.min(1.5, Math.abs(vx));
  const g = (x: number) => ground(Math.round(x));
  const sx = 1 + s * 0.16, sy = 0.86 - s * 0.08;
  const wob = Math.sin(t * 9) * 0.04 * s;
  return [
    { x: cx, y: g(cx) - r * sy + 1, r, sx: sx + wob, sy: sy - wob },
    { x: cx + dir * r * 0.75, y: g(cx + dir * r * 0.75) - r * 0.3 + 1, r: r * 0.5, sy: 0.6 },
    { x: cx - dir * r * 0.95, y: g(cx - dir * r * 0.95) - r * 0.28 + 1, r: r * 0.55, sx: 1.2, sy: 0.55 },
    { x: cx - dir * r * 1.75, y: g(cx - dir * r * 1.75) - r * 0.18 + 1, r: r * 0.28, sx: 1.4, sy: 0.6 },
    // Droplets flung off the back.
    { x: cx - dir * r * 2.5, y: g(cx - dir * r * 2.5) - r * 0.5, r: r * 0.13 },
    { x: cx - dir * r * 3.1, y: g(cx - dir * r * 3.1) - r * 0.25, r: r * 0.1 },
  ];
}
