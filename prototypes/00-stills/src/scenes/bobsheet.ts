import { Buf, Kind } from "../kit/buf.ts";
import { drawBob, idleBob, movingBob, type Lobe } from "../kit/bob.ts";
import { hex, mix, type RGB } from "../kit/color.ts";
import { plume } from "../kit/fx.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint, type Material } from "../kit/materials.ts";
import { rect } from "../kit/paint.ts";
import { fbm } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270, PW = 160, PH = 135;
const R = 15; // Bob is drawn bigger here than in play, to show detail

interface Panel { label: string; wall: [RGB, RGB]; floor: Material; light: RGB }
const PANELS: Panel[] = [
  { label: "idle: soft, breathing", wall: [hex("#2a3a2c"), hex("#3c5440")], floor: MAT.grass, light: hex("#fff0d8") },
  { label: "moving: stretch + trail", wall: [hex("#3a2e26"), hex("#54423a")], floor: MAT.dirt, light: hex("#fff0d8") },
  { label: "squeeze: through a gap", wall: [hex("#262a34"), hex("#3a4050")], floor: MAT.stone, light: hex("#e8f0ff") },
  { label: "cold: stiff, brittle", wall: [hex("#22314a"), hex("#3a5070")], floor: MAT.ice, light: hex("#bcd8ff") },
  { label: "hot: runny, drips", wall: [hex("#3a2020"), hex("#58302a")], floor: MAT.metal, light: hex("#ffb070") },
  { label: "split: torn on a spike", wall: [hex("#2a2436"), hex("#403652")], floor: MAT.rock, light: hex("#f0e0ff") },
];

const px = (i: number) => (i % 3) * PW, py = (i: number) => Math.floor(i / 3) * PH;
const floorY = (i: number) => py(i) + PH - 26;

export const bobsheet: SceneDef = {
  id: "bob",
  title: "Bob's states",
  blurb: "One body, many behaviours. Each state is the same particles with different bond settings.",
  notes: [
    "Idle and moving: soft bonds, shape memory pulls him back to a dome. Speed stretches him and leaves droplets behind.",
    "Squeeze: he flows through any gap wider than a couple of pixels, losing no mass.",
    "Cold: bonds stiffen and shorten their break distance, so a knock shatters instead of squashing.",
    "Hot: bonds weaken and shape memory fades: he spreads, drips off edges and steams.",
    "Split: pieces that tear off keep moving as their own blobs; touching again re-bonds them.",
  ],
  w: W,
  h: H,
  fixedZoom: true,
  focus: [0.5, 0.5],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    const lights: PointLight[] = [];
    PANELS.forEach((p, i) => {
      const x0 = px(i), y0 = py(i), fy = floorY(i);
      rect(x0, y0, PW, PH, (x, y) => {
        const n = fbm(x * 0.05, y * 0.05, seed + i);
        buf.set(x, y, mix(p.wall[0], p.wall[1], n), Kind.Back, 0);
        if (y >= fy) paint(buf, x, y, p.floor, y === fy ? 0.95 : 0.55 - (y - fy) * 0.02, seed);
        if (x === x0 || y === y0) buf.set(x, y, [0, 0, 0], Kind.Solid, 0);
      });
      lights.push({ x: x0 + 40, y: y0 + 20, color: p.light, radius: 170, intensity: 1.4 });
    });
    // Squeeze: two rock walls with a slot.
    const sx = px(2) + 80;
    rect(sx - 6, py(2), 12, floorY(2) - py(2) - 9, (x, y) => paint(buf, x, y, MAT.rock, 0.6, seed));
    rect(sx - 6, floorY(2) - 3, 12, 3, (x, y) => paint(buf, x, y, MAT.rock, 0.6, seed));
    // Hot: the plate ends in a ledge to drip off.
    rect(px(4) + 110, floorY(4), 50, 26, (x, y) => buf.set(x, y, mix(PANELS[4].wall[0], [0, 0, 0], 0.3), Kind.Back, 0));
    // Split: a spike sticking up from the floor.
    const spikeX = px(5) + 92;
    for (let k = 0; k < 18; k++) for (let o = -Math.floor((18 - k) / 6); o <= Math.floor((18 - k) / 6); o++) paint(buf, spikeX + o, floorY(5) - k, MAT.steel, 0.6 + o * 0.2, seed);
    lights.push({ x: px(4) + 150, y: floorY(4) + 10, color: hex("#ff7a28"), radius: 90, intensity: 1.2, flicker: 0.4 });

    return {
      buf,
      lights,
      ambient: [0.16, 0.16, 0.2],
      depth: { fade: 30, min: 0.3 },
      backLit: 0.7,
      grade: { vignette: 0.1, bloom: 0.5, threshold: 0.9 },
      frame(b, t) {
        const g = (i: number) => (x: number) => (b.solidAt(x, floorY(i) - 3) ? floorY(i) - 4 : floorY(i));
        // Idle.
        drawBob(b, idleBob(px(0) + 80, g(0), R, t), { palette, t, eyes: { x: px(0) + 82, y: floorY(0) - 20, size: 2 } });
        // Moving right, fast.
        drawBob(b, movingBob(px(1) + 90, g(1), R, 1.3, t), { palette, t, loose: 0.8, eyes: { x: px(1) + 96, y: floorY(1) - 19, look: 1, size: 2 } });
        // Squeeze: most of him on the left, a neck through the slot, a bulb emerging right.
        const f2 = floorY(2);
        const sq: Lobe[] = [
          { x: sx - 24, y: f2 - 10, r: 12, sx: 0.9, sy: 0.85 },
          { x: sx - 11, y: f2 - 5, r: 6, sx: 1, sy: 0.7 },
          { x: sx - 3, y: f2 - 6, r: 2.4, sx: 2.2, sy: 0.6 },
          { x: sx + 4, y: f2 - 6, r: 2.4, sx: 2.2, sy: 0.6 },
          { x: sx + 14, y: f2 - 6, r: 7 + Math.sin(t * 2) * 0.6, sy: 0.85 },
        ];
        drawBob(b, sq, { palette, t, loose: 0.7, eyes: { x: sx - 22, y: f2 - 17, look: 1, size: 2 } });
        // Cold: stiff dome, with a chipped-off shard.
        drawBob(b, idleBob(px(3) + 72, g(3), R, 0, -0.05), { palette, state: "cold", t, loose: 0.1, eyes: { x: px(3) + 73, y: floorY(3) - 20, look: 1, size: 2 } });
        drawBob(b, [{ x: px(3) + 104, y: floorY(3) - 3, r: 3.5, sx: 1.3, sy: 0.8 }, { x: px(3) + 112, y: floorY(3) - 1.5, r: 1.8 }], { palette, state: "cold", t, loose: 0.1, eyes: null });
        // Hot: puddled and running off the ledge.
        const f4 = floorY(4), ex = px(4) + 110;
        const hot: Lobe[] = [
          { x: ex - 34, y: f4 - 7, r: 12, sx: 1.3, sy: 0.62 },
          { x: ex - 16, y: f4 - 3, r: 7, sx: 1.6, sy: 0.5 },
          { x: ex - 2, y: f4 - 1.5, r: 4, sx: 1.4, sy: 0.6 },
          { x: ex + 1, y: f4 + 3, r: 2.4, sy: 1.4 },
        ];
        for (let i = 0; i < 3; i++) {
          const age = (t * 0.9 + i / 3) % 1;
          hot.push({ x: ex + 1.5, y: f4 + 6 + age * 20, r: 1.6 * (1 - age * 0.4) });
        }
        drawBob(b, hot, { palette, state: "hot", t, loose: 0.9, selfLit: 0.2, eyes: { x: ex - 32, y: f4 - 13, look: 1, size: 2 } });
        plume(b, ex - 30, f4 - 14, 30, t, seed, ["#b8c0c8", "#dfe6ec"].map(hex), 0.25, 0.4, 8);
        // Split: the main body pulls away from a chunk impaled on the spike; a strand stretches between.
        const f5 = floorY(5);
        const stretch = 0.5 + Math.sin(t * 1.2) * 0.5;
        const mainX = px(5) + 46 - stretch * 4;
        drawBob(b, idleBob(mainX, g(5), 13, t, 0.05), { palette, t, loose: 0.7, eyes: { x: mainX - 1, y: f5 - 18, look: 1, size: 2 } });
        drawBob(b, [{ x: spikeX + 1, y: f5 - 16, r: 6, sy: 0.9 }, { x: spikeX + 6, y: f5 - 12, r: 3 }], { palette, t, loose: 0.8, eyes: null });
        const strand: Lobe[] = [];
        for (let k = 1; k < 8; k++) {
          const f = k / 8;
          const x = mainX + 12 + (spikeX - 5 - mainX - 12) * f, y = f5 - 10 - Math.sin(f * Math.PI) * 4 + f * -4;
          if (k === 4 && stretch > 0.7) continue; // the strand snaps at full stretch
          strand.push({ x, y, r: 1.15 });
        }
        drawBob(b, strand, { palette, t, loose: 0.3, eyes: null });
        drawBob(b, [{ x: px(5) + 120, y: f5 - 2, r: 2.2 }, { x: px(5) + 132, y: f5 - 1.5, r: 1.5 }], { palette, t, eyes: null });
      },
    };
  },
  overlay(root) {
    PANELS.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "lbl";
      el.textContent = p.label;
      el.style.left = `${((px(i) + 6) / W) * 100}%`;
      el.style.top = `${((py(i) + 6) / H) * 100}%`;
      root.append(el);
    });
  },
};
