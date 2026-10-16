import { CAT, Cat, M, MATS, World, fbm, hash2 } from "@pixelbob/sim";

/**
 * Turns world cells into the two textures the renderer needs:
 *   color: rgb albedo, a = how it's lit (0 sky/unlit, 128 back wall, 200 open thing, 255 solid)
 *   emit:  rgb emission / 2, a = light occlusion
 * Runs on the CPU every frame; ~130k cells is a millisecond or two.
 */
export class Shade {
  readonly color: Uint8Array;
  readonly emit: Uint8Array;
  private readonly backRGB: Uint8Array;
  private readonly ramps: Uint8Array[];
  private readonly world: World;

  constructor(world: World, seed: number) {
    this.world = world;
    const { w, h } = world;
    this.color = new Uint8Array(w * h * 4);
    this.emit = new Uint8Array(w * h * 4);
    this.backRGB = new Uint8Array(w * h * 3);
    // Per-material colour ramps as bytes.
    this.ramps = MATS.map((m) => Uint8Array.from(m.colors.flatMap((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255])));
    this.bake(seed);
  }

  /** Sky gradient and rock back wall, computed once (and after a reset). */
  bake(seed: number): void {
    const { w, h, back } = this.world;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 3;
        if (back[i]) {
          const n = fbm(x * 0.05, y * 0.05, seed + 11, 3), g = hash2(x, y, seed) * 0.08;
          const k = 0.55 + n * 0.5 + g;
          this.backRGB[j] = 40 * k; this.backRGB[j + 1] = 35 * k; this.backRGB[j + 2] = 32 * k;
        } else {
          const t = y / h;
          this.backRGB[j] = 70 + t * 170; this.backRGB[j + 1] = 120 + t * 90; this.backRGB[j + 2] = 200 - t * 30;
        }
      }
  }

  update(frame: number): void {
    const { world, color, emit, backRGB, ramps } = this;
    const { mat, shade, temp, life, back, w } = world;
    const n = mat.length;
    for (let i = 0; i < n; i++) {
      const m = mat[i], c = CAT[m], o = i * 4, j = i * 3;
      const def = MATS[m];
      let r: number, g: number, b: number, a: number;
      let er = 0, eg = 0, eb = 0;
      if (c === Cat.Empty) {
        r = backRGB[j]; g = backRGB[j + 1]; b = backRGB[j + 2];
        a = back[i] ? 128 : 0;
      } else {
        const ramp = ramps[m];
        let k = ((shade[i] * ramp.length / 3) >> 8) * 3;
        if (c === Cat.Fire) {
          // Fire colour from its remaining life, flickering every frame.
          const f = Math.min(1, life[i] / 40) * 0.7 + hash2(i, frame, 7) * 0.3;
          k = Math.min(ramp.length - 3, Math.floor(f * (ramp.length / 3)) * 3);
          const heat = 0.6 + f;
          er = ramp[k] * heat; eg = ramp[k + 1] * heat * 0.8; eb = ramp[k + 2] * heat * 0.5;
        }
        r = ramp[k]; g = ramp[k + 1]; b = ramp[k + 2];
        // Liquid and gas pixels shimmer a little as they move.
        if (c === Cat.Liquid || c === Cat.Gas) {
          const s = 1 + (hash2(i, frame >> 2, 3) - 0.5) * 0.08;
          r *= s; g *= s; b *= s;
        }
        // Liquid surfaces catch a highlight.
        if (c === Cat.Liquid && i >= w && CAT[mat[i - w]] !== Cat.Liquid) { r = r * 0.6 + 100; g = g * 0.6 + 110; b = b * 0.6 + 120; }
        // Translucent fluids blend over what's behind them.
        if (def.alpha < 1) {
          const al = def.alpha;
          r = r * al + backRGB[j] * (1 - al); g = g * al + backRGB[j + 1] * (1 - al); b = b * al + backRGB[j + 2] * (1 - al);
        }
        a = c === Cat.Static || c === Cat.Powder ? 255 : 200;
        if (def.emit[0] + def.emit[1] + def.emit[2] > 0 && c !== Cat.Fire) {
          const flick = m === M.lava ? 0.75 + hash2(i >> 2, frame >> 3, 5) * 0.4 : 0.85 + (shade[i] / 255) * 0.3;
          const al = def.alpha;
          er = def.emit[0] * 255 * flick * al; eg = def.emit[1] * 255 * flick * al; eb = def.emit[2] * 255 * flick * al;
        }
        // Mushroom caps: pale tops, darker gills underneath that glow brightest.
        if (m === M.cap) {
          if (i + w < n && mat[i + w] !== M.cap) { r *= 0.55; g *= 0.7; b *= 0.7; er *= 1.6; eg *= 1.6; eb *= 1.6; }
          else if (i >= w && mat[i - w] !== M.cap) { r = r * 0.6 + 90; g = g * 0.6 + 100; b = b * 0.6 + 100; }
        }
        // Burning solids glow like embers.
        if (life[i] > 0 && c === Cat.Static) {
          const f = 0.5 + hash2(i, frame >> 1, 9) * 0.5;
          r = r * 0.5 + 120 * f; g = g * 0.5 + 40 * f; b *= 0.5;
          er += 200 * f; eg += 70 * f; eb += 10 * f;
        }
      }
      // Anything very hot glows red, then orange, then yellow.
      const t = temp[i];
      if (t > 450 && c !== Cat.Fire && c !== Cat.Empty && m !== M.lava) {
        const k = Math.min(1, (t - 450) / 900);
        er += 255 * k; eg += 90 * k * k; eb += 20 * k * k * k;
      }
      color[o] = r; color[o + 1] = g; color[o + 2] = b; color[o + 3] = a;
      emit[o] = Math.min(255, er * 0.5); emit[o + 1] = Math.min(255, eg * 0.5); emit[o + 2] = Math.min(255, eb * 0.5);
      emit[o + 3] = def.occ * 255;
    }
  }
}
