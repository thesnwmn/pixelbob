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
  /** Where the camera-zoom control centres (usually Bob), as fractions of w/h. */
  focus: [number, number];
  /** Sheets and UI mockups are composed for the whole frame: ignore the zoom control. */
  fixedZoom?: boolean;
  build(ctx: SceneCtx): Setup;
  /** Optional HTML on top of the canvas (UI mockups, labels). Positioned in % of the canvas. */
  overlay?(root: HTMLElement): void;
}
