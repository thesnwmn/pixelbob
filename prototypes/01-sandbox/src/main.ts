import { CAT, Cat, M, MATS, World, generate, type Preset } from "@pixelbob/sim";
import { GLRenderer, LOOKS, type LampDef } from "./gl.ts";
import { Shade } from "./shade.ts";

const W = 480, H = 270, STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed")) || 7;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>("#view");
const hud = $("#hud");

let world: World, shade: Shade, lamps: LampDef[];
function reset(preset: Preset) {
  world = new World(W, H, seed);
  lamps = generate(world, preset, seed);
  shade = new Shade(world, seed);
}
reset((params.get("preset") as Preset) === "rock" ? "rock" : "demo");

let gl: GLRenderer;
try {
  gl = new GLRenderer(canvas, W, H);
} catch (e) {
  document.body.innerHTML = `<div id="err"><h2>Can't start the renderer</h2><p>${String(e)}</p><p>The sandbox needs WebGL2.</p></div>`;
  throw e;
}

// ---- Tools and palette ----

type Tool = "paint" | "dig" | "heat" | "cool" | "lamp";
const TOOLS: [Tool, string][] = [["dig", "Dig"], ["paint", "Paint"], ["heat", "Heat"], ["cool", "Cool"], ["lamp", "Lamp"]];
const state = { tool: "paint" as Tool, mat: M.sand as number, size: 5, paused: false, look: "day", replace: false };

const toolEl = $("#tools");
for (const [t, label] of TOOLS) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.tool = t;
  b.onclick = () => setTool(t);
  toolEl.append(b);
}
const matEl = $("#mats");
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const paletteMats = MATS.filter((m) => m.palette);
paletteMats.forEach((m, k) => {
  const b = document.createElement("button");
  b.className = "mat";
  b.dataset.mat = String(m.id);
  b.title = k < 9 ? `${m.name} (${k + 1})` : m.name;
  b.innerHTML = `<i style="background:${hex(m.colors[Math.floor(m.colors.length / 2)])}"></i>${m.name}`;
  b.onclick = () => { state.mat = m.id; setTool("paint"); };
  matEl.append(b);
});
function setTool(t: Tool) {
  state.tool = t;
  for (const b of toolEl.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", b.dataset.tool === t);
  for (const b of matEl.querySelectorAll<HTMLButtonElement>("button")) b.classList.toggle("on", t === "paint" && Number(b.dataset.mat) === state.mat);
}
setTool("paint");

const sizeEl = $<HTMLInputElement>("#size");
sizeEl.oninput = () => (state.size = Number(sizeEl.value));
const lookEl = $<HTMLSelectElement>("#look");
lookEl.value = params.get("look") ?? "day";
state.look = lookEl.value;
lookEl.onchange = () => (state.look = lookEl.value);
const pauseEl = $<HTMLButtonElement>("#pause");
const togglePause = () => { state.paused = !state.paused; pauseEl.textContent = state.paused ? "Play" : "Pause"; pauseEl.classList.toggle("on", state.paused); };
pauseEl.onclick = togglePause;
$<HTMLButtonElement>("#stepbtn").onclick = () => world.step();
const resetEl = $<HTMLSelectElement>("#reset");
resetEl.onchange = () => { if (resetEl.value) reset(resetEl.value as Preset); resetEl.value = ""; };
const fsEl = $<HTMLButtonElement>("#fs");
if (!document.fullscreenEnabled) fsEl.style.display = "none";
fsEl.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));

// ---- Sizing: biggest fit, integer scale when it's close ----

function resize() {
  const box = $("#stage").getBoundingClientRect();
  let s = Math.min(box.width / W, box.height / H);
  const dpr = window.devicePixelRatio || 1;
  const si = Math.floor(s * dpr) / dpr; // whole device pixels per cell, if it costs little space
  if (si >= 1 / dpr && si / s > 0.85) s = si;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
}
new ResizeObserver(resize).observe($("#stage"));
resize();

// ---- Pointer input ----

const ptr = { down: false, x: 0, y: 0, lx: 0, ly: 0, over: false };
const toCell = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
};
const fillFor = (m: number) => (CAT[m] === Cat.Static ? 1 : CAT[m] === Cat.Gas || CAT[m] === Cat.Fire ? 0.45 : 0.55);

function brush(x: number, y: number) {
  const r = state.size;
  if (state.tool === "dig") world.paint(x, y, r, M.air);
  else if (state.tool === "paint") world.paint(x, y, r, state.mat, { fill: fillFor(state.mat), replace: state.replace });
  else if (state.tool === "heat") world.heat(x, y, r * 1.5, 60);
  else if (state.tool === "cool") world.heat(x, y, r * 1.5, -8);
}
function strokeTo(x: number, y: number) {
  const d = Math.hypot(x - ptr.lx, y - ptr.ly), n = Math.max(1, Math.ceil(d / Math.max(1, state.size * 0.5)));
  for (let k = 1; k <= n; k++) brush(ptr.lx + ((x - ptr.lx) * k) / n, ptr.ly + ((y - ptr.ly) * k) / n);
  ptr.lx = x; ptr.ly = y;
}
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = toCell(e);
  Object.assign(ptr, { down: true, x, y, lx: x, ly: y });
  state.replace = e.shiftKey || e.button === 2;
  if (state.tool === "lamp") {
    const near = lamps.findIndex((l) => Math.hypot(l.x - x, l.y - y) < 8);
    if (near >= 0) lamps.splice(near, 1);
    else if (lamps.length < 16) lamps.push({ x: Math.floor(x), y: Math.floor(y), color: [1, 0.82, 0.55], radius: 110 });
    return;
  }
  brush(x, y);
});
canvas.addEventListener("pointermove", (e) => {
  const [x, y] = toCell(e);
  ptr.x = x; ptr.y = y; ptr.over = true;
  if (ptr.down && state.tool !== "lamp") strokeTo(x, y);
});
const up = () => (ptr.down = false);
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("pointerleave", () => (ptr.over = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === " ") { togglePause(); e.preventDefault(); }
  else if (e.key === ".") world.step();
  else if (e.key === "[") sizeEl.value = String((state.size = Math.max(1, state.size - 1)));
  else if (e.key === "]") sizeEl.value = String((state.size = Math.min(24, state.size + 1)));
  else if (e.key === "d") setTool("dig");
  else if (e.key === "h") setTool("heat");
  else if (e.key === "c") setTool("cool");
  else if (e.key === "l") setTool("lamp");
  else if (/^[1-9]$/.test(e.key) && paletteMats[Number(e.key) - 1]) { state.mat = paletteMats[Number(e.key) - 1].id; setTool("paint"); }
});

// ---- Loop ----

let last = performance.now(), acc = 0, frame = 0, fps = 60, simMs = 0;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!state.paused) {
    acc += dt;
    let n = 0;
    const t0 = performance.now();
    while (acc >= STEP && n < 3) {
      // Holding still keeps pouring (and heating) under the pointer.
      if (ptr.down && state.tool !== "lamp" && state.tool !== "dig") brush(ptr.x, ptr.y);
      world.step();
      acc -= STEP;
      n++;
    }
    if (n === 3) acc = 0;
    if (n) simMs += ((performance.now() - t0) / n - simMs) * 0.1;
  } else if (ptr.down && (state.tool === "heat" || state.tool === "cool")) brush(ptr.x, ptr.y);
  shade.update(frame++);
  gl.render(shade.color, shade.emit, lamps, LOOKS[state.look] ?? LOOKS.day);
  let under = "";
  if (ptr.over) {
    const cx = Math.floor(ptr.x), cy = Math.floor(ptr.y);
    if (world.inside(cx, cy)) {
      const i = cy * W + cx;
      under = `\n${MATS[world.mat[i]].name} ${Math.round(world.temp[i])}°C`;
    }
  }
  hud.textContent = `${fps.toFixed(0)} fps · sim ${simMs.toFixed(1)} ms · chunks ${world.awakeCount()}/${world.cw * world.ch}${under}`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
