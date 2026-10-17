import { describe, expect, it } from "vitest";
import { PALETTES } from "../src/kit/goo.ts";
import { Renderer } from "../src/kit/render.ts";
import { SCENES } from "../src/scenes/index.ts";

const frame = (id: string, seed: number, t: number) => {
  const def = SCENES.find((s) => s.id === id)!;
  const r = new Renderer(def.build({ seed, palette: PALETTES.coral }));
  const img = { width: def.w, height: def.h, data: new Uint8ClampedArray(def.w * def.h * 4) } as ImageData;
  r.render(img, t);
  return img.data;
};

describe("stills", () => {
  it.each(SCENES.map((s) => s.id))("%s renders a non-trivial image", (id) => {
    const d = frame(id, 7, 2.5);
    let sum = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v;
      if (v > 60) lit++;
    }
    expect(sum / (d.length / 4)).toBeGreaterThan(20); // not black
    expect(lit / (d.length / 4)).toBeGreaterThan(0.05);
  });

  it("is deterministic for a seed and time", () => {
    expect(frame("caverns", 3, 1.25)).toEqual(frame("caverns", 3, 1.25));
  });

  it("animates over time", () => {
    expect(frame("green", 7, 1)).not.toEqual(frame("green", 7, 2));
  });
});
