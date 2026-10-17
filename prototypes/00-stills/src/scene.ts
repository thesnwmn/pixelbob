import type { BobPalette } from "./kit/goo.ts";
import type { Setup } from "./kit/render.ts";

export interface SceneCtx {
  seed: number;
  palette: BobPalette;
}

export interface SceneDef {
  id: string;
  title: string;
  /** One line under the title. */
  blurb: string;
  /** Art direction notes and open questions shown with the still. */
  notes: string[];
  w: number;
  h: number;
  build(ctx: SceneCtx): Setup;
  /** Optional HTML on top of the canvas (UI mockups, labels). Positioned in % of the canvas. */
  overlay?(root: HTMLElement): void;
}
