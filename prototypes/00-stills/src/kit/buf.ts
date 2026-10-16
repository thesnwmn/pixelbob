import type { RGB } from "./color.ts";

/**
 * What a pixel is, for lighting purposes. This mirrors the split the real game
 * will have: unlit backdrop, lit back wall, solid world cells, and things in
 * front of the back wall (liquids, gases, plants, Bob).
 */
export const Kind = {
  /** Painted backdrop (sky, distant hills). Not lit; already final colour. */
  Sky: 0,
  /** Back wall behind the play layer. Lit, but dimmer. */
  Back: 1,
  /** Solid world cell (rock, dirt, metal). Lit, darkens with depth. */
  Solid: 2,
  /** Plants, props, Bob. Lit normally. */
  Object: 3,
  /** Liquids and gases. Lit normally. */
  Fluid: 4,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

/** A scene's pixel layers: albedo, emission, kind and how much each cell blocks light. */
export class Buf {
  readonly alb: Float32Array;
  readonly emi: Float32Array;
  readonly kind: Uint8Array;
  /** Light blocked per cell in [0, 1]. Solids ~0.5 so light bleeds a few pixels into surfaces. */
  readonly occ: Float32Array;

  readonly w: number;
  readonly h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.alb = new Float32Array(w * h * 3);
    this.emi = new Float32Array(w * h * 3);
    this.kind = new Uint8Array(w * h);
    this.occ = new Float32Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  idx(x: number, y: number): number {
    return (y | 0) * this.w + (x | 0);
  }

  set(x: number, y: number, c: RGB, kind: Kind, occ = kind === Kind.Solid ? 0.5 : 0): void {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = y * this.w + x, j = i * 3;
    this.alb[j] = c[0]; this.alb[j + 1] = c[1]; this.alb[j + 2] = c[2];
    this.kind[i] = kind;
    this.occ[i] = occ;
  }

  /** Alpha-blend a colour over what is there. Kind changes only if given. */
  blend(x: number, y: number, c: RGB, a: number, kind?: Kind, occ?: number): void {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = y * this.w + x, j = i * 3;
    this.alb[j] += (c[0] - this.alb[j]) * a;
    this.alb[j + 1] += (c[1] - this.alb[j + 1]) * a;
    this.alb[j + 2] += (c[2] - this.alb[j + 2]) * a;
    if (kind !== undefined) this.kind[i] = kind;
    if (occ !== undefined) this.occ[i] = Math.max(this.occ[i], occ);
  }

  glow(x: number, y: number, c: RGB, k = 1): void {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const j = (y * this.w + x) * 3;
    this.emi[j] += c[0] * k; this.emi[j + 1] += c[1] * k; this.emi[j + 2] += c[2] * k;
  }

  get(x: number, y: number): RGB {
    const j = this.idx(x, y) * 3;
    return [this.alb[j], this.alb[j + 1], this.alb[j + 2]];
  }

  kindAt(x: number, y: number): number {
    return this.inside(x, y) ? this.kind[(y | 0) * this.w + (x | 0)] : Kind.Solid;
  }

  solidAt(x: number, y: number): boolean {
    return this.kindAt(x, y) === Kind.Solid;
  }

  copyFrom(o: Buf): void {
    this.alb.set(o.alb); this.emi.set(o.emi); this.kind.set(o.kind); this.occ.set(o.occ);
  }

  clone(): Buf {
    const b = new Buf(this.w, this.h);
    b.copyFrom(this);
    return b;
  }
}
