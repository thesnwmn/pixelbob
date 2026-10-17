import { M } from "@pixelbob/sim";
import type { BobModel, BobView } from "@pixelbob/bob";
import { Buf, Kind } from "../kit/buf.ts";
import { hex, mix, type RGB } from "../kit/color.ts";
import { plume } from "../kit/fx.ts";
import { drawGoo, movePose, poseFrames, type Pose } from "../kit/goo.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint, type Material } from "../kit/materials.ts";
import { rect } from "../kit/paint.ts";
import { fbm } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270, PW = 160, PH = 90;

interface Panel { label: string; wall: [RGB, RGB]; floor: Material; light: RGB }
const PANELS: Panel[] = [
  { label: "idle: a dome that settles", wall: [hex("#2a3a2c"), hex("#3c5440")], floor: MAT.grass, light: hex("#fff0d8") },
  { label: "rolling: leans into it", wall: [hex("#3a2e26"), hex("#54423a")], floor: MAT.dirt, light: hex("#fff0d8") },
  { label: "jump: squash, then spring", wall: [hex("#262a34"), hex("#3a4050")], floor: MAT.stone, light: hex("#e8f0ff") },
  { label: "runny: pours under a slot", wall: [hex("#3a2020"), hex("#58302a")], floor: MAT.metal, light: hex("#ffb070") },
  { label: "runny: hangs on a thread, drips", wall: [hex("#24303a"), hex("#344858")], floor: MAT.rock, light: hex("#d8ecff") },
  { label: "climbing gum: push in, push up", wall: [hex("#2a2436"), hex("#403652")], floor: MAT.rock, light: hex("#f0e0ff") },
  { label: "frozen: dropped, it cracks", wall: [hex("#22314a"), hex("#3a5070")], floor: MAT.ice, light: hex("#bcd8ff") },
  { label: "spikes: cut into pieces", wall: [hex("#2e2a30"), hex("#48404a")], floor: MAT.rock, light: hex("#fff0e0") },
  { label: "hot: a puddle that steams", wall: [hex("#3a2418"), hex("#5a3424")], floor: MAT.metal, light: hex("#ffa060") },
];

const px = (i: number) => (i % 3) * PW, py = (i: number) => Math.floor(i / 3) * PH;
const floorY = (i: number) => py(i) + PH - 14;
const region = (i: number): [number, number, number, number] => [px(i), py(i), PW, PH];

export const bobsheet: SceneDef = {
  id: "bob",
  title: "Bob's states",
  blurb: "One goo, many behaviours. Every shape here is the real Bob, simulated into it.",
  notes: [
    "Each panel drops the game's Bob (packages/bob) into the panel and plays him a second or two of input; what you see is where his particles ended up.",
    "Temperature turns his knobs continuously: springy jelly at room temperature, honey when hot, rigid and brittle when frozen.",
    "Runny and holding still, he tenses: that's what lets him hang on a thread. Too far, and the thread snaps.",
    "Tacky walls (moss, resin, gum) hold him when you push in; up climbs. He hangs like a drop.",
    "Pieces keep their own physics and rejoin when they touch; the eyes stay with the piece you steer.",
  ],
  w: W,
  h: H,
  fixedZoom: true,
  focus: [0.5, 0.5],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    const sim = new Uint8Array(W * H);
    const put = (x: number, y: number, mat: Material, m: number, shade = 0.6) => { paint(buf, x, y, mat, shade, seed); sim[y * W + x] = m; };
    const lights: PointLight[] = [];
    PANELS.forEach((p, i) => {
      const x0 = px(i), y0 = py(i), fy = floorY(i);
      rect(x0, y0, PW, PH, (x, y) => {
        const n = fbm(x * 0.05, y * 0.05, seed + i);
        buf.set(x, y, mix(p.wall[0], p.wall[1], n), Kind.Back, 0);
        if (y >= fy) paint(buf, x, y, p.floor, y === fy ? 0.95 : 0.55 - (y - fy) * 0.02, seed);
        if (x === x0 || y === y0) buf.set(x, y, [0, 0, 0], Kind.Solid, 0);
      });
      lights.push({ x: x0 + 40, y: y0 + 14, color: p.light, radius: 150, intensity: 1.3 });
    });
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (buf.kind[y * W + x] === Kind.Solid && !sim[y * W + x]) sim[y * W + x] = M.rock;
    for (let x = px(6); x < px(6) + PW; x++) for (let y = floorY(6); y < py(6) + PH; y++) sim[y * W + x] = M.ice;

    // Slot: a steel wall with a 4 px gap under it.
    const sx = px(3) + 86;
    rect(sx, py(3) + 1, 6, floorY(3) - py(3) - 5, (x, y) => put(x, y, MAT.steel, M.steel, 0.5));
    // Ledge to dangle from, over a drop to the floor.
    const lx = px(4) + 70, ly = py(4) + 26;
    rect(px(4) + 1, ly, lx - px(4) - 1, floorY(4) - ly, (x, y) => put(x, y, MAT.rock, M.rock, y === ly ? 0.9 : 0.5));
    // Gum wall.
    const gx = px(5) + 96;
    rect(gx, py(5) + 1, PW - 97, floorY(5) - py(5) - 1, (x, y) => put(x, y, MAT.gum, M.gum, x === gx ? 0.9 : 0.5));
    // Spikes: a bed of them.
    for (let x = px(7) + 50; x < px(7) + 110; x += 2) for (let k = 0; k < 4; k++) put(x, floorY(7) - 1 - k, MAT.spikes, M.spike, 0.9 - k * 0.1);
    lights.push({ x: px(8) + 130, y: floorY(8) - 4, color: hex("#ff7a28"), radius: 80, intensity: 1.2, flicker: 0.4 });
    // A heater plate under the hot puddle.
    rect(px(8) + 110, floorY(8), 40, 2, (x, y) => { paint(buf, x, y, MAT.molten, 0.7, seed, 0.6); });

    const mat = (x: number, y: number) => sim[y * W + x] || M.air;
    const pose = (i: number, o: Partial<Pose> & { x: number }): BobView =>
      poseFrames(buf, { y: floorY(i) - 12, region: region(i), mat, ...o, x: px(i) + o.x }, [o.frames ?? 120])[0];
    const right = { move: 1, jump: false };
    const still = { move: 0, jump: false };
    // Width of his main piece's right side, in region coordinates.
    const front = (b: BobModel) => { const v = b.view(), p = v.pieces[0]; let x1 = -Infinity; for (let k = p.start; k < p.start + p.len; k++) x1 = Math.max(x1, v.x[v.order[k]]); return x1; };
    let go = true;
    const specs: (Partial<Pose> & { x: number })[] = [
      { x: 80, frames: 90 },
      { x: 40, frames: 70, input: () => right },
      { x: 80, frames: 112, input: (f) => ({ move: 0, jump: f >= 60 && f < 100 }) },
      { x: 50, temp: 70, frames: 88, input: () => right },
      { x: 50, y: ly - 13, temp: 62, frames: 205, each: (f) => { if (f === 0) go = true; }, input: (_f, b) => { if (front(b) > lx - px(4) + 4) go = false; return go ? right : still; } },
      { x: 70, frames: 105, input: (f) => ({ move: 1, jump: false, up: f > 30 ? 1 : 0 }) },
      { x: 80, temp: -20, frames: 150, each: (f, b) => { if (f === 60) b.shift(0, -40); } },
      { x: 80, y: floorY(7) - 50, frames: 110 },
      { x: 70, temp: 62, frames: 200 },
    ];
    const poses: [BobView, number][] = specs.map((o, i) => [pose(i, o), i === 8 ? 1.4 : 1]);

    // Debugging aid: STRIP=<panel>:<frames,...> shows that panel's pose at each of those frames.
    const strip = typeof process === "undefined" ? undefined : process.env.STRIP;
    if (strip) {
      const [pi, fl] = strip.split(":"), i = Number(pi), at = fl.split(",").map(Number);
      const o = specs[i];
      const series = poseFrames(buf, { y: floorY(i) - 12, region: region(i), mat, ...o, x: px(i) + o.x }, at);
      poses.length = 0;
      series.forEach((v, j) => {
        const dx = px(j) - px(i), dy = py(j) - py(i);
        if (j !== i) for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
          const a = (py(i) + y) * W + px(i) + x, c = (py(j) + y) * W + px(j) + x;
          buf.kind[c] = buf.kind[a]; buf.occ[c] = buf.occ[a];
          for (let ch = 0; ch < 3; ch++) { buf.alb[c * 3 + ch] = buf.alb[a * 3 + ch]; buf.emi[c * 3 + ch] = buf.emi[a * 3 + ch]; }
        }
        poses.push([movePose(v, dx, dy), 1]);
      });
    }

    return {
      buf,
      lights,
      ambient: [0.16, 0.16, 0.2],
      depth: { fade: 30, min: 0.3 },
      backLit: 0.7,
      grade: { vignette: 0.1, bloom: 0.5, threshold: 0.9 },
      frame(b, t) {
        for (const [v, k] of poses) drawGoo(b, v, { palette, t, selfLit: k });
        plume(b, px(8) + 70, floorY(8) - 8, 26, t, seed, ["#b8c0c8", "#dfe6ec"].map(hex), 0.25, 0.4, 8);
      },
    };
  },
  overlay(root) {
    PANELS.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "lbl";
      el.textContent = p.label;
      el.style.left = `${((px(i) + 6) / W) * 100}%`;
      el.style.top = `${((py(i) + 4) / H) * 100}%`;
      root.append(el);
    });
  },
};
