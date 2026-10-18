/**
 * The level palette: the colour each material is painted in, in a level's `materials.png`.
 * Palette index i is material i (`M`), so an indexed PNG saved with this palette reads
 * straight through; any other PNG is read by colour. Air is black; every other colour is
 * one from the material's own ramp, so a painted level looks like what it will be.
 * Levels are read by colour, so retuning a ramp's middle colour breaks every painted level
 * that uses it: `node game/scripts/levels.ts` (the health check's code/levels) says which.
 */
import { M, MATS } from "./materials.ts";

/** 0xRRGGBB per material id. */
export const PAINT: readonly number[] = MATS.map((m) => (m.id === M.air ? 0x000000 : m.colors[m.colors.length >> 1]));

const BY_COLOR = new Map(PAINT.map((c, id) => [c, id]));

/** The material painted in this colour (0xRRGGBB), or -1 if it isn't one in the palette. */
export function paintedMaterial(rgb: number): number {
  return BY_COLOR.get(rgb) ?? -1;
}
