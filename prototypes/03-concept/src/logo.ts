import { Buf, Kind } from "@pixelbob/00-stills/kit/buf.ts";
import { hex, mix } from "@pixelbob/00-stills/kit/color.ts";
import { motes } from "@pixelbob/00-stills/kit/fx.ts";
import { drawGoo, poseBob, type BobPalette } from "@pixelbob/00-stills/goo";
import type { PointLight } from "@pixelbob/00-stills/kit/light.ts";
import { MAT, paint } from "@pixelbob/00-stills/kit/materials.ts";
import { hash2 } from "@pixelbob/00-stills/kit/rng.ts";
import type { Setup } from "@pixelbob/00-stills/render";

/**
 * The logo is a lit scene like any shot: carved stone letters with moss on top, and
 * the O of BOB is Bob himself, the real goo, sitting in the gap.
 */
const GLYPHS: Record<string, string[]> = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
};
const S = 3, GAP = 3, TOP = 14, O_GAP = 24;
const WORD = ["P", "I", "X", "E", "L", "B", "O", "B"];

export const LOGO_W = 178, LOGO_H = 50;

export function buildLogo(seed: number, palette: BobPalette): Setup {
  const W = LOGO_W, H = LOGO_H, buf = new Buf(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) buf.set(x, y, mix(hex("#141119"), hex("#1f1a26"), hash2(x >> 2, y >> 2, seed) * 0.5), Kind.Back, 0);
  const base = TOP + 7 * S;
  let x0 = 6, oX = 0;
  for (const ch of WORD) {
    if (ch === "O") { oX = x0 + O_GAP / 2; x0 += O_GAP + GAP; continue; }
    const g = GLYPHS[ch];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] !== "1") continue;
        for (let dy = 0; dy < S; dy++)
          for (let dx = 0; dx < S; dx++) {
            const x = x0 + c * S + dx, y = TOP + r * S + dy;
            // Lighter on the top-left edges of each stroke, like carved stone.
            const above = r === 0 || g[r - 1][c] !== "1", left = c === 0 || g[r][c - 1] !== "1";
            const edge = (above && dy === 0) || (left && dx === 0);
            paint(buf, x, y, MAT.sand, edge ? 0.95 : 0.35 + (dy / S) * 0.1, seed);
          }
      }
    // Moss along the tops of the letters.
    for (let c = 0; c < g[0].length * S; c++) for (let r = 0; r < 7; r++) {
      const cc = Math.floor(c / S);
      if (g[r][cc] !== "1" || (r > 0 && g[r - 1][cc] === "1")) continue;
      if (hash2(x0 + c, r, seed + 4) < 0.6) paint(buf, x0 + c, TOP + r * S - 1, MAT.moss, 0.8, seed);
    }
    x0 += g[0].length * S + GAP;
  }
  // A ledge for the letters (and Bob) to stand on.
  for (let x = 2; x < W - 2; x++) for (let y = base + 1; y < base + 5; y++) paint(buf, x, y, MAT.stone, y === base + 1 ? 0.95 : 0.45, seed);
  for (let x = 2; x < W - 2; x++) if (hash2(x, 1, seed) < 0.7) paint(buf, x, base, MAT.moss, 0.7, seed);

  const bob = poseBob(buf, { x: oX, y: base - 10, frames: 80, region: [oX - 20, 0, 40, H] });
  const lights: PointLight[] = [
    { x: 50, y: 1, color: hex("#ffd9a0"), radius: 200, intensity: 2.6 },
    { x: W - 10, y: H - 2, color: hex("#3ff0d8"), radius: 110, intensity: 1.2 },
    { x: oX - 6, y: base - 24, color: hex("#fff0e8"), radius: 36, intensity: 1.2 },
  ];
  return {
    buf,
    lights,
    ambient: [0.3, 0.28, 0.34],
    depth: { fade: 10, min: 0.7 },
    backLit: 0.4,
    grade: { vignette: 0.15, bloom: 0.8, threshold: 0.75 },
    frame(b, t) {
      drawGoo(b, bob, { palette, t, selfLit: 1.6 });
      motes(b, 10, t, seed, [0, 0, W, H], hex("#3ff0d8"), 0.8, 3);
    },
  };
}
