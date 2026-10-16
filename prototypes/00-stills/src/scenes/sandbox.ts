import { Buf, Kind } from "../kit/buf.ts";
import { drawBob, idleBob } from "../kit/bob.ts";
import { hex, mix, type RGB } from "../kit/color.ts";
import { flame, motes, plume } from "../kit/fx.ts";
import type { PointLight } from "../kit/light.ts";
import { MAT, paint, type Material } from "../kit/materials.ts";
import { disc, each, rect, rim, stroke } from "../kit/paint.ts";
import { fbm, hash1, hash2, noise2 } from "../kit/rng.ts";
import type { SceneDef } from "../scene.ts";

const W = 480, H = 270;
const SMOKE = ["#2a2a2e", "#3a383c", "#4a464a"].map(hex);

/** Tunnels the player has dug: brush strokes of radius r. */
const DIG: [number, number, number, number, number][] = [
  [70, 0, 90, 70, 9], [90, 70, 150, 120, 14], [150, 120, 250, 130, 18], [250, 130, 330, 110, 16], [330, 110, 420, 150, 15],
  [420, 150, 440, 230, 14], [200, 135, 190, 220, 16], [190, 220, 300, 232, 16], [300, 232, 410, 236, 13], [250, 60, 330, 50, 13],
  [330, 50, 360, 90, 10], [150, 120, 120, 190, 11],
];

const TOOLS = ["Dig", "Place", "Heat", "Cool", "Light", "Bob"];
const PALETTE: [string, Material | RGB][] = [
  ["rock", MAT.rock], ["dirt", MAT.dirt], ["sand", MAT.sand], ["water", MAT.water], ["oil", MAT.oil], ["lava", MAT.lava],
  ["ice", MAT.ice], ["wood", MAT.wood], ["metal", MAT.steel], ["glow goo", MAT.goo], ["toxic gas", MAT.toxic], ["steam", MAT.steam],
];

export const sandbox: SceneDef = {
  id: "sandbox",
  title: "Sandbox (phase 1 mockup)",
  blurb: "Dig into rock, drop in materials and watch them interact. The toy we build next.",
  notes: [
    "Start from solid rock; drag to dig (open cells become back wall), or paint any material.",
    "Interactions on show: sand pours and piles, oil floats on water, lava ignites wood and boils water to steam, toxic gas glows and drifts.",
    "Heat/Cool brushes change temperature only: ice melts, water freezes, Bob changes state.",
    "Editor uses a flat work light so you can see what you build; toggle it off to preview real lighting.",
    "The HUD mirrors the debug overlay the real sim needs (active chunks, cell counts, temperature under cursor).",
  ],
  w: W,
  h: H,
  fixedZoom: true,
  focus: [0.5, 0.55],
  build({ seed, palette }) {
    const buf = new Buf(W, H);
    each(buf, (x, y) => {
      const strata = fbm(x * 0.01, y * 0.04, seed, 4);
      const m = y < 24 + fbm(x * 0.02, 0, seed) * 10 ? MAT.dirt : strata > 0.62 ? MAT.stone : MAT.rock;
      paint(buf, x, y, m, 0.4 + fbm(x * 0.08, y * 0.08, seed + 1) * 0.4, seed);
    });
    const dug = new Set<number>();
    for (const [x0, y0, x1, y1, r] of DIG)
      stroke(x0, y0, x1, y1, r, (x, y) => {
        if (!buf.inside(x, y)) return;
        const n = fbm(x * 0.2, y * 0.2, seed + 2);
        if (n < 0.25 || dug.has(y * W + x)) return; // ragged edges; dig each pixel once
        dug.add(y * W + x);
        const c = mix(buf.get(x, y), [0, 0, 0], 0.25);
        buf.set(x, y, c, Kind.Back, 0);
      });
    rim(buf, hex("#8a7a68"), 0.3, 2);

    const fill = (m: Material, x0: number, x1: number, top: number, bottom: number, k = 0) => {
      for (let x = x0; x <= x1; x++) for (let y = top; y <= bottom; y++) if (buf.kindAt(x, y) === Kind.Back) paint(buf, x, y, m, 0.5 + (y === top ? 0.4 : 0), seed, k);
    };
    // Water pool in the lower tunnel with a film of oil on top.
    fill(MAT.water, 196, 300, 230, H);
    fill(MAT.oil, 196, 300, 227, 229);
    for (let x = 196; x <= 300; x++) if (buf.kindAt(x, 227) === Kind.Fluid && noise2(x * 0.2, 1, seed) > 0.6) buf.blend(x, 227, hex("#6a4aa0"), 0.5);
    // Lava pocket at the bottom right.
    fill(MAT.lava, 395, 452, 232, H, 0.9);
    // Sand pile under a hole, in the middle chamber.
    for (let x = 150; x < 250; x++) {
      const h = Math.max(0, 22 - Math.abs(x - 205) * 0.55 + (hash2(x, 0, seed) - 0.5) * 2);
      for (let y = 0; y < h; y++) {
        let gy = 147; while (gy > 100 && buf.kindAt(x, gy) !== Kind.Back) gy--;
        if (buf.kindAt(x, gy - y) === Kind.Back) paint(buf, x, gy - y, MAT.sand, 0.4 + (y / h) * 0.4, seed);
      }
    }
    // Ice block and a metal beam bridging the right tunnel; a wooden plank over the lava.
    rect(300, 96, 16, 16, (x, y) => paint(buf, x, y, MAT.ice, x === 300 || y === 96 ? 0.95 : 0.55, seed));
    rect(376, 150, 70, 4, (x, y) => paint(buf, x, y, MAT.steel, y === 150 ? 0.9 : 0.4, seed));
    rect(400, 218, 40, 3, (x, y) => paint(buf, x, y, MAT.wood, 0.55, seed));
    // A lamp the player placed.
    for (const [lx, ly] of [[130, 106], [249, 204], [359, 103]]) rect(lx, ly, 3, 3, (x, y) => { buf.set(x, y, hex("#fff1c4"), Kind.Object, 0); buf.glow(x, y, hex("#ffd890"), 1.5); });

    const lights: PointLight[] = [
      { x: 131, y: 107, color: hex("#ffd8a0"), radius: 160, intensity: 1.6 },
      { x: 422, y: 228, color: hex("#ff6a20"), radius: 150, intensity: 2.0, flicker: 0.5 },
      { x: 300, y: 56, color: hex("#60ff50"), radius: 90, intensity: 0.8 },
      { x: 250, y: 205, color: hex("#ffe0b0"), radius: 120, intensity: 1.2 },
      { x: 360, y: 104, color: hex("#ffe0b0"), radius: 120, intensity: 1.2 },
    ];
    const bobX = 330, ground = (x: number) => { for (let y = 100; y < H; y++) if (buf.solidAt(x, y)) return y; return H; };

    return {
      buf,
      lights,
      ambient: [0.85, 0.82, 0.8],
      depth: { fade: 16, min: 0.32 },
      backLit: 0.9,
      grade: { vignette: 0.3, bloom: 0.9, threshold: 0.75 },
      frame(b, t) {
        // Sand still pouring from the hole above the pile.
        for (let i = 0; i < 40; i++) {
          const age = (t * 1.6 + hash1(i, seed) ) % 1;
          const x = 204 + Math.round((hash1(i, seed + 1) - 0.5) * 3), y = 112 + age * 16;
          if (b.kindAt(x, y) === Kind.Back) b.set(x, y, MAT.sand.ramp[i % 4], Kind.Solid, 0.3);
        }
        flame(b, 420, 217, 18, 22, t, seed, 1);
        plume(b, 420, 192, 60, t, seed + 1, SMOKE, 0.5, 0.3, 10);
        plume(b, 300, 226, 30, t, seed + 2, ["#cfdbe4", "#e3ecf2"].map(hex), 0.25, 0.4, 8);
        // Toxic gas cloud drifting in the upper tunnel.
        for (let y = 36; y < 72; y++)
          for (let x = 250; x < 350; x++) {
            if (b.kindAt(x, y) !== Kind.Back) continue;
            const n = fbm(x * 0.06 - t * 0.3, y * 0.08, seed + 5, 3);
            if (n < 0.5) continue;
            b.blend(x, y, MAT.toxic.ramp[n > 0.62 ? 1 : 0], (n - 0.5) * 1.6, Kind.Fluid, 0.02);
            b.glow(x, y, MAT.toxic.emit!, (n - 0.5) * 0.7);
          }
        motes(b, 12, t, seed, [390, 160, 60, 60], hex("#ffb060"), 1.2, 14);
        // Bob is a material too: drop him in and poke things.
        drawBob(b, idleBob(bobX, ground, 10, t), { palette, t, eyes: { x: bobX + 1, y: ground(bobX) - 13, look: -1, size: 2 } });
        // Brush cursor mid-dig.
        disc(158, 182, 9, (x, y) => { if (Math.abs(Math.hypot(x - 158, y - 182) - 9) < 0.6 && ((x + y) & 1)) b.glow(x, y, [1, 1, 1], 0.5); });
      },
    };
  },
  overlay(root) {
    const sw = (c: RGB) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
    const bar = document.createElement("div");
    bar.className = "mock-bar";
    bar.style.cssText = "left:1.5%;top:2.5%";
    bar.innerHTML = TOOLS.map((t, i) => `<span class="tool${i === 0 ? " on" : ""}">${t}</span>`).join("");
    const pal = document.createElement("div");
    pal.className = "mock-bar v";
    pal.style.cssText = "right:1.5%;top:2.5%";
    pal.innerHTML = PALETTE.map(([n, m], i) => {
      const c = Array.isArray(m) ? m : m.ramp[Math.floor(m.ramp.length / 2)];
      return `<span class="sw${i === 2 ? " on" : ""}"><i style="background:${sw(c)}"></i>${n}</span>`;
    }).join("");
    const hud = document.createElement("div");
    hud.className = "mock-hud";
    hud.style.cssText = "left:1.5%;bottom:2%";
    hud.innerHTML = "60 fps · sim 2.1 ms · 129,600 cells<br>active chunks 11/60 · brush 9 · 24 °C under cursor";
    root.append(bar, pal, hud);
  },
};
