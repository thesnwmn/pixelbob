import { Buf, Kind } from "../../kit/buf.ts";
import type { SceneDef } from "../../scene.ts";

const W = 320, H = 180;

// Placeholder: the shot for this world is being built (docs/11-worlds.md).
export const ruins: SceneDef = {
  id: "ruins",
  title: "Sticky Ruins",
  blurb: "",
  notes: [],
  w: W,
  h: H,
  focus: [0.5, 0.5],
  fixedZoom: true,
  build() {
    const buf = new Buf(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf.set(x, y, [0.2, 0.2, 0.25], Kind.Back, 0);
    return { buf, lights: [], ambient: [0.3, 0.3, 0.3] };
  },
};
